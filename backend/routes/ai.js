const express = require('express');
    const router = express.Router();
    const pool = require('../db');
    const Groq = require('groq-sdk');
    const { authMiddleware } = require('../middleware/auth');

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    router.post('/summary/:patient_code', authMiddleware, async (req, res) => {
      const { patient_code } = req.params;
      try {
        const patientResult = await pool.query('SELECT * FROM patients WHERE patient_code = $1', [patient_code]);
        if (patientResult.rows.length === 0) return res.status(404).json({ error: 'Patient not found.' });
        const patient = patientResult.rows[0];
        const recordsResult = await pool.query(
          `SELECT mr.*, u.full_name as doctor_name FROM medical_records mr
           LEFT JOIN users u ON mr.doctor_id = u.id
           WHERE mr.patient_id = $1 ORDER BY mr.visit_date DESC`, [patient.id]
        );
        const records = recordsResult.rows;
        if (records.length === 0) {
          return res.json({ summary: `No medical records found for ${patient.full_name}. This appears to be their first visit.`, risks: [], recommendations: [] });
        }
        const patientContext = `
    Patient: ${patient.full_name}
    DOB: ${patient.date_of_birth || 'Unknown'} | Gender: ${patient.gender || 'Unknown'}
    Blood Group: ${patient.blood_group || 'Unknown'} | Genotype: ${patient.genotype || 'Unknown'}
    Allergies: ${patient.allergies || 'None'} | Chronic Conditions: ${patient.chronic_conditions || 'None'}

    Medical History (${records.length} visits):
    ${records.map((r, i) => `Visit ${i+1} - ${new Date(r.visit_date).toDateString()} at ${r.hospital || 'Unknown'}
    Doctor: ${r.doctor_name || 'Unknown'}
    Complaint: ${r.chief_complaint || 'N/A'} | Diagnosis: ${r.diagnosis || 'N/A'}
    Treatment: ${r.treatment || 'N/A'} | Prescriptions: ${r.prescriptions || 'N/A'}
    Lab: ${r.lab_results || 'N/A'} | Notes: ${r.notes || 'N/A'}`).join('\n---\n')}`;

        const completion = await groq.chat.completions.create({
          model: 'llama3-8b-8192',
          messages: [
            { role: 'system', content: `You are a medical AI assistant for MediLink Africa. Analyze patient history and respond as JSON with: summary (3-5 sentences), risks (array), recommendations (array), last_visit_summary (1 sentence).` },
            { role: 'user', content: `Analyze this patient history:\n\n${patientContext}` }
          ],
          temperature: 0.3, max_tokens: 800,
          response_format: { type: 'json_object' }
        });
        res.json(JSON.parse(completion.choices[0].message.content));
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'AI summary failed.' });
      }
    });

    router.post('/handover', authMiddleware, async (req, res) => {
      const { patient_codes } = req.body;
      if (!patient_codes || !Array.isArray(patient_codes) || patient_codes.length === 0)
        return res.status(400).json({ error: 'Provide an array of patient_codes.' });
      try {
        const patientSummaries = [];
        for (const code of patient_codes) {
          const pr = await pool.query('SELECT * FROM patients WHERE patient_code = $1', [code]);
          if (pr.rows.length === 0) continue;
          const p = pr.rows[0];
          const rr = await pool.query('SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY visit_date DESC LIMIT 1', [p.id]);
          patientSummaries.push({ patient_code: code, name: p.full_name, blood_group: p.blood_group, allergies: p.allergies, chronic_conditions: p.chronic_conditions, latest_visit: rr.rows[0] || null });
        }
        if (patientSummaries.length === 0) return res.status(404).json({ error: 'No valid patients found.' });
        const handoverContext = patientSummaries.map(p =>
          `Patient: ${p.name} (${p.patient_code}) | Blood: ${p.blood_group || 'Unknown'} | Allergies: ${p.allergies || 'None'}\nConditions: ${p.chronic_conditions || 'None'}\nLatest: ${p.latest_visit ? `${p.latest_visit.chief_complaint} / ${p.latest_visit.diagnosis}` : 'No records'}`
        ).join('\n===\n');
        const completion = await groq.chat.completions.create({
          model: 'llama3-8b-8192',
          messages: [
            { role: 'system', content: 'You are a medical AI for MediLink Africa. Generate a shift handover brief as JSON with: handover_brief (paragraph), patients (array of: patient_code, name, priority high/medium/low, key_points array, pending_actions array).' },
            { role: 'user', content: `Generate handover brief:\n\n${handoverContext}` }
          ],
          temperature: 0.3, max_tokens: 1200,
          response_format: { type: 'json_object' }
        });
        const aiResponse = JSON.parse(completion.choices[0].message.content);
        await pool.query('INSERT INTO handovers (doctor_id, hospital, ai_summary, patients_covered) VALUES ($1,$2,$3,$4)',
          [req.user.id, req.user.hospital, JSON.stringify(aiResponse), JSON.stringify(patient_codes)]);
        res.json(aiResponse);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Handover generation failed.' });
      }
    });

    module.exports = router;
    