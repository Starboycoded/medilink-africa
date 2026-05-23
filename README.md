# MediLink Africa 🏥
    **Unified AI-Powered Patient Health Record System**

    Built for the Udara Project Hackathon 2026 by NSK AI

    ## The Problem
    - Patients in Africa carry physical hospital cards that get lost
    - Each hospital creates a new file — no shared history
    - In emergencies, doctors have zero context on the patient
    - Staff shift changes cause dangerous information gaps

    ## The Solution
    MediLink Africa gives every patient a unique digital ID (QR code) linked to their full medical history — accessible by any authorized hospital across Africa.

    ## Core Features
    1. **Patient Registration & QR ID** — unique patient code + downloadable QR
    2. **Medical Record Management** — cross-hospital visit history
    3. **AI Health Summary** — Groq-powered instant patient briefing
    4. **Smart Shift Handover** — AI generates handover brief for incoming staff
    5. **Role-Based Access** — Doctor, Nurse, Admin, Patient roles

    ## Tech Stack
    - **Backend:** Node.js + Express
    - **Database:** PostgreSQL (Neon)
    - **AI:** Groq API (llama3)
    - **Auth:** JWT
    - **Frontend:** HTML/CSS/JS

    ## Setup
    ```bash
    cd backend
    npm install
    cp .env.example .env
    # Fill in your .env values
    npm start
    ```
    