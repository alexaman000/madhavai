# 🦚 Madhav.ai Backend Service (Step 2 & Step 3)

This is the NestJS backend service for **Madhav.ai** — an AI companion inspired by the teachings of the Bhagavad Gita.

---

## 1. Architecture Overview

```
                      USER
                        │
                        ↓
               📱 MADHAV FRONTEND / APK
                        │
       ┌────────────────┴────────────────┐
       │ HTTP API                        │
       ↓                                 ↓
 POST /api/auth/request-otp     POST /api/auth/verify-otp
       │                                 │
       ↓                                 ↓
┌────────────────────────────────────────────────────────┐
│                    NESTJS BACKEND                      │
│                                                        │
│  • AuthController (/api/auth)                          │
│  • AuthService (Crypto OTP Generator & SHA-256 Hashing) │
│  • JwtStrategy & AuthGuard (Passport)                  │
│  • Resend Email Service                                │
│  • Supabase Database Service                           │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ↓                           ↓
   📧 RESEND EMAIL SERVICE     🗄️ SUPABASE POSTGRESQL
   (OTP Email Delivery)        (users & otp_verifications)
```

---

## 2. Prerequisites

* **Node.js**: `>= 20.0.0`
* **npm**: `>= 10.0.0`
* **Supabase PostgreSQL Account** (or local database fallback)
* **Resend API Key**

---

## 3. Database Schema DDL (Supabase PostgreSQL)

Execute the following SQL script in your **Supabase SQL Editor** to create the required tables and indexes:

```sql
-- Enable uuid extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. OTP Verifications Table
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for OTP queries and cleanup
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);
```

---

## 4. Environment Variables (`.env`)

Create a `.env` file in the `backend/` directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Session Security
JWT_SECRET=madhav_secret_jwt_key_step_3_2026_super_secure
JWT_EXPIRES_IN=7d

# Supabase Credentials
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Resend Email Service
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=auth@madhav.ai

# OTP Security Parameters
OTP_EXPIRY_MINUTES=5
MAX_OTP_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60

# Optional Domain Restriction (leave blank to allow all domains)
AUTH_ALLOWED_EMAIL_DOMAIN=
```

---

## 5. Running the Server

```bash
cd backend
npm install
npm run start:dev
```

---

## 6. Authentication API Endpoints

### 1. Request OTP
* **Method**: `POST`
* **Endpoint**: `/api/auth/request-otp`
* **Headers**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "email": "user@example.com"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "OTP has been sent to your email address."
  }
  ```

### 2. Verify OTP & Login
* **Method**: `POST`
* **Endpoint**: `/api/auth/verify-otp`
* **Headers**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "email": "user@example.com",
    "otp": "123456"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Authentication successful.",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "email": "user@example.com"
    }
  }
  ```

### 3. Get Current User Profile (Protected)
* **Method**: `GET`
* **Endpoint**: `/api/auth/me`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "email": "user@example.com"
    }
  }
  ```

### 4. Logout (Protected)
* **Method**: `POST`
* **Endpoint**: `/api/auth/logout`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Successfully logged out."
  }
  ```

---

## 7. Testing Commands (curl)

```bash
# Request OTP
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "aman@example.com"}'

# Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "aman@example.com", "otp": "YOUR_6_DIGIT_OTP"}'

# Get Profile with Bearer Token
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
