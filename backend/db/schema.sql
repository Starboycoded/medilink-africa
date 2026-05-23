-- MediLink Africa Database Schema

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor', 'nurse', 'admin')),
      hospital VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      patient_code VARCHAR(20) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      date_of_birth DATE,
      gender VARCHAR(10),
      blood_group VARCHAR(5),
      genotype VARCHAR(5),
      allergies TEXT,
      chronic_conditions TEXT,
      emergency_contact_name VARCHAR(255),
      emergency_contact_phone VARCHAR(20),
      phone VARCHAR(20),
      address TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id UUID REFERENCES users(id),
      hospital VARCHAR(255),
      visit_date TIMESTAMP DEFAULT NOW(),
      chief_complaint TEXT,
      diagnosis TEXT,
      treatment TEXT,
      prescriptions TEXT,
      lab_results TEXT,
      notes TEXT,
      follow_up_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS handovers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id UUID REFERENCES users(id),
      hospital VARCHAR(255),
      handover_date TIMESTAMP DEFAULT NOW(),
      ai_summary TEXT,
      patients_covered TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patient_code);
    CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient_id);
    CREATE INDEX IF NOT EXISTS idx_records_date ON medical_records(visit_date);
    