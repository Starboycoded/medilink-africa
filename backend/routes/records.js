const express = require('express');
    const router = express.Router();
    const pool = require('../db');
    const { authMiddleware, requireRole } = require('../middleware/auth');

    router.post('/', authMiddleware, requireRole('doctor', 'nurse'), async (req, res) => {
      const { patient_code, chief_complaint, diagnosis, treatment,
        prescriptions, lab_results, notes, follow_up_date } = req.body;
      if (!patient_code || !chief_complaint)
        return res.status(400).json({ error: 'Patient code and chief complaint are required.' });
      try {
        const patientResult = await pool.query('SELECT id FROM patients WHERE patient_code = $1', [patient_code]);
        if (patientResult.rows.length === 0) return res.status(404).json({ error: 'Patient not found.' });
        const patient_id = patientResult.rows[0].id;
        const result = await pool.query(
          `INSERT INTO medical_records (patient_id, doctor_id, hospital, chief_complaint, diagnosis,
             treatment, prescriptions, lab_results, notes, follow_up_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [patient_id, req.user.id, req.user.hospital || 'Unknown Hospital',
           chief_complaint, diagnosis, treatment, prescriptions, lab_results, notes, follow_up_date || null]
        );
        res.status(201).json({ message: 'Medical record added.', record: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error adding record.' });
      }
    });

    router.get('/:patient_code', authMiddleware, async (req, res) => {
      const { patient_code } = req.params;
      try {
        const patientResult = await pool.query('SELECT id, full_name FROM patients WHERE patient_code = $1', [patient_code]);
        if (patientResult.rows.length === 0) return res.status(404).json({ error: 'Patient not found.' });
        const patient = patientResult.rows[0];
        const records = await pool.query(
          `SELECT mr.*, u.full_name as doctor_name, u.hospital as doctor_hospital
           FROM medical_records mr LEFT JOIN users u ON mr.doctor_id = u.id
           WHERE mr.patient_id = $1 ORDER BY mr.visit_date DESC`, [patient.id]
        );
        res.json({ patient_name: patient.full_name, records: records.rows });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching records.' });
      }
    });

    module.exports = router;
    