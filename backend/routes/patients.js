const express = require('express');
    const router = express.Router();
    const pool = require('../db');
    const QRCode = require('qrcode');
    const { authMiddleware, requireRole } = require('../middleware/auth');

    const generatePatientCode = async () => {
      const result = await pool.query('SELECT COUNT(*) FROM patients');
      const count = parseInt(result.rows[0].count) + 1;
      return `MLA-${String(count).padStart(6, '0')}`;
    };

    router.post('/register', authMiddleware, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
      const { full_name, date_of_birth, gender, blood_group, genotype,
        allergies, chronic_conditions, emergency_contact_name,
        emergency_contact_phone, phone, address } = req.body;
      if (!full_name) return res.status(400).json({ error: 'Patient full name is required.' });
      try {
        const patient_code = await generatePatientCode();
        const result = await pool.query(
          `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, blood_group, genotype,
             allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, phone, address)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [patient_code, full_name, date_of_birth, gender, blood_group, genotype,
           allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, phone, address]
        );
        const patient = result.rows[0];
        const qrData = JSON.stringify({ patient_code, full_name });
        const qrCode = await QRCode.toDataURL(qrData);
        res.status(201).json({ message: 'Patient registered successfully.', patient, qrCode });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error registering patient.' });
      }
    });

    router.get('/:patient_code', authMiddleware, async (req, res) => {
      const { patient_code } = req.params;
      try {
        const result = await pool.query('SELECT * FROM patients WHERE patient_code = $1', [patient_code]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found.' });
        const patient = result.rows[0];
        const records = await pool.query(
          `SELECT mr.*, u.full_name as doctor_name FROM medical_records mr
           LEFT JOIN users u ON mr.doctor_id = u.id
           WHERE mr.patient_id = $1 ORDER BY mr.visit_date DESC LIMIT 10`,
          [patient.id]
        );
        const qrData = JSON.stringify({ patient_code, full_name: patient.full_name });
        const qrCode = await QRCode.toDataURL(qrData);
        res.json({ patient, records: records.rows, qrCode });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching patient.' });
      }
    });

    router.get('/', authMiddleware, async (req, res) => {
      const { search } = req.query;
      try {
        let result;
        if (search) {
          result = await pool.query(
            `SELECT id, patient_code, full_name, date_of_birth, gender, blood_group, phone
             FROM patients WHERE full_name ILIKE $1 OR patient_code ILIKE $1
             ORDER BY full_name LIMIT 20`, [`%${search}%`]
          );
        } else {
          result = await pool.query(
            `SELECT id, patient_code, full_name, date_of_birth, gender, blood_group, phone
             FROM patients ORDER BY created_at DESC LIMIT 20`
          );
        }
        res.json({ patients: result.rows });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error searching patients.' });
      }
    });

    router.put('/:patient_code', authMiddleware, requireRole('doctor', 'nurse', 'admin'), async (req, res) => {
      const { patient_code } = req.params;
      const { blood_group, genotype, allergies, chronic_conditions,
        emergency_contact_name, emergency_contact_phone, phone, address } = req.body;
      try {
        const result = await pool.query(
          `UPDATE patients SET
            blood_group = COALESCE($1, blood_group), genotype = COALESCE($2, genotype),
            allergies = COALESCE($3, allergies), chronic_conditions = COALESCE($4, chronic_conditions),
            emergency_contact_name = COALESCE($5, emergency_contact_name),
            emergency_contact_phone = COALESCE($6, emergency_contact_phone),
            phone = COALESCE($7, phone), address = COALESCE($8, address)
           WHERE patient_code = $9 RETURNING *`,
          [blood_group, genotype, allergies, chronic_conditions,
           emergency_contact_name, emergency_contact_phone, phone, address, patient_code]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found.' });
        res.json({ message: 'Patient updated.', patient: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error updating patient.' });
      }
    });

    module.exports = router;
    