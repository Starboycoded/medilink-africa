require('dotenv').config();
    const express = require('express');
    const cors = require('cors');

    const app = express();

    app.use(cors());
    app.use(express.json());

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/patients', require('./routes/patients'));
    app.use('/api/records', require('./routes/records'));
    app.use('/api/ai', require('./routes/ai'));

    app.get('/', (req, res) => {
      res.json({
        message: 'MediLink Africa API is running 🏥',
        version: '1.0.0',
        endpoints: {
          auth: '/api/auth/register | /api/auth/login',
          patients: '/api/patients | /api/patients/:patient_code',
          records: '/api/records | /api/records/:patient_code',
          ai: '/api/ai/summary/:patient_code | /api/ai/handover'
        }
      });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`MediLink Africa server running on port ${PORT}`);
    });
    