const express = require('express');
    const router = express.Router();
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const pool = require('../db');

    router.post('/register', async (req, res) => {
      const { full_name, email, password, role, hospital } = req.body;
      if (!full_name || !email || !password || !role)
        return res.status(400).json({ error: 'All fields are required.' });
      const validRoles = ['doctor', 'nurse', 'admin'];
      if (!validRoles.includes(role))
        return res.status(400).json({ error: 'Invalid role.' });
      try {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0)
          return res.status(409).json({ error: 'Email already registered.' });
        const password_hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
          `INSERT INTO users (full_name, email, password_hash, role, hospital)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role, hospital`,
          [full_name, email, password_hash, role, hospital || null]
        );
        const user = result.rows[0];
        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
          process.env.JWT_SECRET, { expiresIn: '7d' }
        );
        res.status(201).json({ message: 'Registration successful.', token, user });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during registration.' });
      }
    });

    router.post('/login', async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password)
        return res.status(400).json({ error: 'Email and password are required.' });
      try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0)
          return res.status(401).json({ error: 'Invalid email or password.' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid)
          return res.status(401).json({ error: 'Invalid email or password.' });
        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
          process.env.JWT_SECRET, { expiresIn: '7d' }
        );
        res.json({ message: 'Login successful.', token,
          user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, hospital: user.hospital }
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during login.' });
      }
    });

    module.exports = router;
    