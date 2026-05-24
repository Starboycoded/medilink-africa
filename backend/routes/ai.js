const express = require('express');
const router = express.Router();
const pool = require('../db');
const Groq = require('groq-sdk');
const { authMiddleware } = require('../middleware/auth');

// Lazy init — only create Groq client when a request comes in
const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

// POST /api/ai/summary/:patient_code - AI summary of patient history
router.post('/summary/:patient_code', authMiddleware, async (req, res) => {
  const { patient_code } = req.params;

  try {
    // Get patient info
    const patientResult = await pool.query(
      'SELECT * FROM patients WHERE patient_code = $1', [patient_code]
    );
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found.' });
    }
    const patient = patientResult.rows[0];

    // Get all medical records
    const recordsResult = await pool.query(
      `SELECT mr.*, u.full_name as doctor_name
       FROM medical_records mr
       LEFT JOIN users u ON mr.doctor_id = u.id
       WHERE mr.patient_id = $1
       ORDER BY mr.visit_date DESC`,
      [patient.id]
    );
    const records = recordsResult.rows;

    if (records.length === 0) {
      return res.json({
        summary: `No medical records found for ${patient.full_name}. This appears to be their first visit.`,
        risks: [],
        recommendations: []
      });
    }

    // Build context for AI
    const patientContext = `
Patient: ${patient.full_name}
Date of Birth: ${patient.date_of_birth || 'Unknown'}
Gender: ${patient.gender || 'Unknown'}
Blood Group: ${patient.blood_group || 'Unknown'}
Genotype: ${patient.genotype || 'Unknown'}
Known Allergies: ${patient.allergies || 'None recorded'}
Chronic Conditions: ${patient.chronic_conditions || 'None recorded'}

Medical History (${records.length} visits):
${records.map((r, i) => `
Visit ${i + 1} - ${new Date(r.visit_date).toDateString()} at ${r.hospital || 'Unknown Hospital'}
Doctor: ${r.doctor_name || 'Unknown'}
Complaint: ${r.chief_complaint || 'N/A'}
Diagnosis: ${r.diagnosis || 'N/A'}
Treatment: ${r.treatment || 'N/A'}
Prescriptions: ${r.prescriptions || 'N/A'}
Lab Results: ${r.lab_results || 'N/A'}
Notes: ${r.notes || 'N/A'}
`).join('\n---\n')}
    `.trim();

    const completion = await getGroq().chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: `You are a medical AI assistant for MediLink Africa. 
Your job is to help doctors quickly understand a patient's medical history.
Always be concise, clear, and clinically relevant.
Format your response as JSON with these fields:
- summary: A 3-5 sentence plain-language summary of the patient's health history
- risks: An array of critical risks or flags (allergies, drug interactions, chronic conditions to watch)
- recommendations: An array of 2-3 actionable recommendations for the attending doctor
- last_visit_summary: One sentence about the most recent visit`
        },
        {
          role: 'user',
          content: `Please analyze this patient's medical history and provide a clinical summary:\n\n${patientContext}`
        }
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content);
    res.json(aiResponse);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI summary failed. Please try again.' });
  }
});

// POST /api/ai/handover - AI shift handover summary
router.post('/handover', authMiddleware, async (req, res) => {
  const { patient_codes } = req.body;

  if (!patient_codes || !Array.isArray(patient_codes) || patient_codes.length === 0) {
    return res.status(400).json({ error: 'Provide an array of patient_codes for handover.' });
  }

  try {
    const patientSummaries = [];

    for (const code of patient_codes) {
      const patientResult = await pool.query(
        'SELECT * FROM patients WHERE patient_code = $1', [code]
      );
      if (patientResult.rows.length === 0) continue;

      const patient = patientResult.rows[0];

      // Get most recent record
      const recentRecord = await pool.query(
        `SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY visit_date DESC LIMIT 1`,
        [patient.id]
      );

      patientSummaries.push({
        patient_code: code,
        name: patient.full_name,
        blood_group: patient.blood_group,
        allergies: patient.allergies,
        chronic_conditions: patient.chronic_conditions,
        latest_visit: recentRecord.rows[0] || null
      });
    }

    if (patientSummaries.length === 0) {
      return res.status(404).json({ error: 'No valid patients found.' });
    }

    const handoverContext = patientSummaries.map(p => `
Patient: ${p.name} (${p.patient_code})
Blood Group: ${p.blood_group || 'Unknown'} | Allergies: ${p.allergies || 'None'}
Chronic Conditions: ${p.chronic_conditions || 'None'}
Latest Visit: ${p.latest_visit ? `
  - Complaint: ${p.latest_visit.chief_complaint}
  - Diagnosis: ${p.latest_visit.diagnosis}
  - Treatment: ${p.latest_visit.treatment}
  - Prescriptions: ${p.latest_visit.prescriptions}
  - Follow-up: ${p.latest_visit.follow_up_date || 'None scheduled'}
` : 'No records yet'}
`).join('\n===\n');

    const completion = await getGroq().chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: `You are a medical AI assistant for MediLink Africa helping with shift handovers.
Create a clear, concise handover brief for the incoming medical staff.
Format as JSON with:
- handover_brief: A paragraph summarizing the overall ward/shift status
- patients: An array of objects, each with: patient_code, name, priority (high/medium/low), key_points (array), pending_actions (array)`
        },
        {
          role: 'user',
          content: `Generate a shift handover brief for these patients:\n\n${handoverContext}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content);

    // Save handover to DB
    await pool.query(
      `INSERT INTO handovers (doctor_id, hospital, ai_summary, patients_covered)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, req.user.hospital, JSON.stringify(aiResponse), JSON.stringify(patient_codes)]
    );

    res.json(aiResponse);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Handover generation failed. Please try again.' });
  }
});

module.exports = router;
