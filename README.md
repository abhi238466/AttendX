# AttendX — Smart Attendance Management System

<p align="center">
  <strong>A smarter and more organized way to manage classroom attendance.</strong>
</p>

<p align="center">
  <img src="frontend/public/attendex.png" alt="AttendX Logo" width="120" />
</p>

<p align="center">
  <img src="[https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=black](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=black)" />
  <img src="[https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?logo=nodedotjs&logoColor=white](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?logo=nodedotjs&logoColor=white)" />
  <img src="[https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)" />
  <img src="[https://img.shields.io/badge/ORM-Prisma-2D3748?logo=prisma](https://img.shields.io/badge/ORM-Prisma-2D3748?logo=prisma)" />
  <img src="[https://img.shields.io/badge/Frontend%20Hosting-Vercel-black?logo=vercel](https://img.shields.io/badge/Frontend%20Hosting-Vercel-black?logo=vercel)" />
  <img src="[https://img.shields.io/badge/Backend%20Hosting-Render-46E3B7?logo=render](https://img.shields.io/badge/Backend%20Hosting-Render-46E3B7?logo=render)" />
</p>

---

## Table of Contents

- [Project Overview](#project-overview)
- [Problem Statement](#problem-statement)
- [Objectives](#objectives)
- [How AttendX Works](#how-attendx-works)
- [Core Features](#core-features)
- [Attendance Verification](#attendance-verification)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Database Design](#database-design)
- [Project Structure](#project-structure)
- [Local Installation](#local-installation)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Deployment](#deployment)
- [Security Design and Limitations](#security-design-and-limitations)
- [Testing and Validation](#testing-and-validation)
- [Known Considerations](#known-considerations)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [Project Information](#project-information)

---

## Project Overview

AttendX is a web-based classroom attendance management system designed to make attendance recording, classroom session management, and attendance history more organized.

Teachers create attendance sessions and students enter them using a dynamic QR code or text code. Before attendance is recorded, the backend performs session and token checks, validates the student's reported location against configured active campus geofence zones, and uses a short-lived symbol challenge as an additional verification step. Duplicate-record constraints and session-specific device controls provide further safeguards.

The frontend is built with React and Vite, the backend uses Node.js and Express, and persistent data is stored in PostgreSQL through Prisma ORM. The frontend and backend are hosted separately on Vercel and Render.

AttendX is an academic project. Security, reliability, and capacity must be established through repeatable testing; the presence of a security feature alone does not prove complete protection.

---

## Problem Statement

Manual attendance can consume classroom time and make record maintenance difficult. Basic digital attendance methods may also provide limited checks against proxy attendance, repeated submissions, or unauthorized record changes.

AttendX introduces a structured session-based workflow with QR/text-code entry, campus-level location validation, symbol verification, and server-side attendance checks. It aims to simplify the teacher's attendance process while keeping records organized.

---

## Objectives

- Digitize classroom attendance and session management.
- Provide QR-code and text-code entry options.
- Validate reported student location against configured campus zones.
- Add a short-lived symbol challenge for an additional verification step.
- Prevent duplicate attendance records within a session.
- Apply session-specific device controls and record relevant verification attempts.
- Provide administration features for teacher accounts and campus geofence zones.
- Store attendance and related records in PostgreSQL.
- Provide a responsive browser-based interface.

---

## How AttendX Works

1. An administrator manages teacher accounts and configures active campus geofence zones.
2. An authenticated teacher creates a session with course, subject, class, room, section, schedule, and duration details.
3. AttendX generates session entry credentials. Students can use the QR code or text code.
4. The student opens the attendance page, enters the required details, and grants location permission.
5. The backend checks the token, session timing, submitted details, and campus geofence.
6. The student receives a symbol grid containing nine symbols in three rows.
7. The student selects the correct symbol in each row within the challenge validity period.
8. The backend verifies the challenge and applies duplicate/device checks before recording attendance.
9. The record is available through the system's attendance-management and history features.

The backend makes the attendance decision. Frontend route protection or interface logic is not a substitute for server-side validation.

---

## Core Features

### Administration
- Admin authentication using server-managed sessions.
- Teacher account management and status updates.
- Teacher approval/status workflow support.
- Teacher password reset workflow.
- Campus geofence zone management.
- Audit records for selected administrative actions.

### Teacher
- Separate teacher authentication/session flow.
- Teacher-specific attendance session management.
- Create, update, view, and close attendance sessions.
- Configure course, subject, class, room, sections, schedule, and duration.
- Generate and rotate QR/text-code credentials.
- View attendance records and session history.
- Authorized manual attendance management and corrections.

### Student Attendance
- QR-code and text-code session entry.
- Time-limited attendance tokens.
- Campus geofence validation against active configured zones.
- Runtime-generated symbol verification.
- Student details and section validation.
- Duplicate attendance protection.
- Session-specific device locking and security-violation tracking.
- Attendance-attempt logging for relevant outcomes.

### User Interface
- React single-page application.
- Responsive desktop, tablet, and mobile layouts.
- Separate workflows for administrators, teachers, and student attendance.

---

## Attendance Verification

### QR Code and Text Code
A teacher starts a session and AttendX provides QR and text-code entry. The backend stores a hash of the generated token in the token record and validates the submitted token and expiry.

The current backend configuration sets the token lifetime to **50 seconds**. Token expiry and attendance-session expiry are separate checks.

### Campus Geofence
Administrators configure campus geofence zones. Each active zone has a centre coordinate and radius. The student's reported coordinates are checked against active zones.

The backend also checks location accuracy and capture time. The current implementation sets a maximum accepted location accuracy of **100 metres** and rejects stale or excessively inaccurate readings. Browser GPS can be inaccurate or manipulated; it is a verification signal, not absolute proof of physical presence.

### Symbol Challenge
- Nine randomly selected symbols are arranged in three rows.
- The student selects one correct symbol from each row.
- Correct answers are retained on the backend and should not be exposed in student-facing challenge data.
- The configured challenge lifetime is **25 seconds**.
- A maximum of **three wrong attempts** is configured for a symbol challenge attempt.

### Duplicate and Device Controls
The database enforces one attendance record per normalized university roll number per attendance session. Device token hashes support session-specific device controls.

The implementation tracks fullscreen-exit and tab-switch incidents. The second recorded violation is configured to create a device lock for that attendance session. These are deterrents and risk signals, not foolproof identity verification.

---

## System Architecture

```text
                    ┌────────────────────────────┐
                    │       User Browser         │
                    │     Desktop / Mobile       │
                    └─────────────┬──────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │        React + Vite        │
                    │          Frontend          │
                    │           Vercel           │
                    └─────────────┬──────────────┘
                                  │ HTTPS / API
                                  ▼
                    ┌────────────────────────────┐
                    │      Node.js + Express     │
                    │         Backend API        │
                    │           Render           │
                    └─────────────┬──────────────┘
                                  │ Prisma ORM
                                  ▼
                    ┌────────────────────────────┐
                    │         PostgreSQL         │
                    │ Users, Sessions, Tokens,   │
                    │ Attendance and Audit Data  │
                    └────────────────────────────┘
```

| Component | Responsibility |
| :--- | :--- |
| **React + Vite** | User interface and client-side navigation |
| **Node.js + Express** | API endpoints, business rules, authentication middleware, validation |
| **Prisma ORM** | Database queries and transaction handling |
| **PostgreSQL** | Persistent application and attendance data |
| **Vercel** | Frontend hosting |
| **Render** | Backend hosting |

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend framework** | React |
| **Frontend tooling** | Vite |
| **Styling** | CSS, Tailwind CSS |
| **Routing** | React Router |
| **HTTP requests** | Axios |
| **QR rendering** | `qrcode.react` |
| **Icons** | `lucide-react` |
| **Backend runtime** | Node.js |
| **Backend framework** | Express.js |
| **Database** | PostgreSQL |
| **ORM** | Prisma ORM |
| **Authentication/session** | `express-session` |
| **Session persistence** | `connect-pg-simple` with PostgreSQL |
| **Password hashing** | `bcryptjs` |
| **Request validation** | Zod |
| **Rate limiting** | `express-rate-limit` |
| **Security headers** | Helmet |
| **Cross-origin requests** | CORS |
| **Media integration** | Cloudinary package (where configured) |
| **Email integration** | Resend package (where configured) |
| **Hosting** | Vercel and Render |
| **Version control** | Git and GitHub |

---

## Database Design

AttendX uses PostgreSQL with Prisma ORM. The current Prisma schema defines these main models:

| Model | Purpose |
| :--- | :--- |
| **Admin** | Administrator account details |
| **Teacher** | Teacher profile, credentials, and account status |
| **AttendanceSession** | Teacher-created classroom sessions |
| **QrCodeToken** | Hashed QR/text-code tokens and expiry |
| **AttendanceRecord** | Successful attendance records |
| **AttendanceAttempt** | Verification outcomes and risk flags |
| **OtpChallenge** | OTP challenge and password-reset data |
| **AuditLog** | Selected administrative/system audit events |
| **TeacherLoginLockout** | Persistent teacher login lockout state |
| **AdminLoginLockout** | Persistent admin login lockout state |
| **AttendanceChallenge** | Attendance challenge token data |
| **AttendanceDeviceLock** | Session-specific device token hashes |
| **SymbolChallenge** | Symbol grid and server-side correct answers |
| **SymbolChallengeAttempt** | Device symbol-verification attempt |
| **SymbolChallengeViolation** | Fullscreen/tab-switch violation counts |
| **SymbolChallengeViolationEvent** | Distinct violation events |
| **GeofenceZone** | Configured campus geofence zones |

### Data Integrity
- UUIDs are used for primary identifiers in the main models.
- Unique constraints help prevent duplicate teacher accounts and duplicate attendance records.
- Attendance records are unique by attendance session and normalized university roll number.
- Token and device values are stored as hashes in relevant models.
- Foreign-key relations define how related records are maintained or deleted.
- Indexes support common lookups by session, teacher, status, and creation time.

Some legacy teacher-location fields remain in `AttendanceSession`, along with location-related fields in attendance records and attempts. Their presence in the schema does not mean the current verification flow uses teacher-to-student distance. Current campus verification uses configured `GeofenceZone` records.

---

## Project Structure

This is a high-level structure; individual files may change during development.

```text
AttendX/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.js
│   ├── package.json
│   └── .gitignore
├── frontend/
│   ├── public/
│   │   └── attendex.png
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── .gitignore
├── .gitignore
└── README.md
```

---

## Local Installation

### Prerequisites
- Node.js and npm
- PostgreSQL database
- Git
- Visual Studio Code or another code editor

Use a Node.js version compatible with the installed Vite and project dependencies.

### 1. Clone the repository
```bash
git clone https://github.com/abhi238466/AttendX.git
cd AttendX
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Configure backend environment
Create a `.env` file inside `backend`. See [Environment Configuration](#environment-configuration).

### 4. Generate Prisma Client
```bash
npx prisma generate
```

### 5. Apply database migrations
For a development database:
```bash
npx prisma migrate dev
```

For a deployed database, use the reviewed production migration workflow:
```bash
npx prisma migrate deploy
```
Do not run development migrations against a production database.

### 6. Start the backend
```bash
npm start
```
For development, if the configured development tool is installed:
```bash
npm run dev
```

### 7. Install frontend dependencies
Open a second terminal from the repository root:
```bash
cd frontend
npm install
```

### 8. Configure frontend environment
Create a `.env` file in `frontend` and set the API base URL using the exact variable name read by the current frontend API configuration. Do not assume an example variable name without checking the source.

### 9. Start the frontend
```bash
npm run dev
```
Open the local URL printed by Vite, commonly `http://localhost:5173`.

---

## Environment Configuration

The following backend variables are examples of the settings used by the application. Confirm exact variable names against the current source configuration.

### Backend `.env`
```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_long_random_secret
```
Additional variables may be needed for configured media or email integrations.

### Frontend `.env`
Set the frontend API base URL using the exact variable name expected by the frontend API client.

Never put database credentials, session secrets, private API keys, or service-role keys in frontend variables. Vite exposes variables prefixed with `VITE_` to browser-side code.

### Secret Management
- Do not commit `.env` files.
- Do not publish database connection strings or session secrets.
- Use hosting-platform environment settings for production secrets.
- Use a strong, unique session secret.
- Rotate any credential that has been exposed accidentally.

---

## Database Setup

1. Create a PostgreSQL database for local development.
2. Set the backend database connection string.
3. Generate the Prisma Client.
4. Apply migrations to the intended database.
5. Start the backend and verify database connectivity.

The backend provides:
- `/health` — checks whether the backend process is responding.
- `/health/db` — performs a database connectivity check.

Avoid exposing sensitive database details in public logs or screenshots.

---

## Running the Application

Run the backend and frontend in separate terminals.

**Terminal 1 — Backend**
```bash
cd backend
npm start
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Open the frontend development URL in a browser. Sign-in and attendance workflows require a correctly configured database and relevant account records.

---

## Deployment

| Component | Platform |
| :--- | :--- |
| **Frontend** | Vercel |
| **Backend API** | Render |
| **Database** | PostgreSQL |

### Deployment Checklist
- Configure the deployed backend API URL in the frontend.
- Set backend `FRONTEND_URL` to the exact deployed frontend origin.
- Configure production `DATABASE_URL` and a strong `SESSION_SECRET`.
- Confirm HTTPS and secure cookie settings.
- Confirm CORS credentials and allowed origin settings.
- Apply reviewed Prisma migrations to the production database.
- Verify Admin and Teacher authentication and authorization.
- Verify teacher-specific record ownership.
- Test QR/text-code validity and expiry.
- Test symbol challenge expiry and wrong-attempt handling.
- Test active campus geofence validation.
- Test duplicate attendance and device-lock behaviour.
- Test session closure and attendance history.
- Test authorized and unauthorized attendance record changes.
- Confirm private credentials are absent from frontend builds and GitHub.
- Run realistic load tests before making concurrency or capacity claims.

A successful deployment confirms hosting and basic availability; it does not, by itself, establish production readiness.

---

## Security Design and Limitations

AttendX includes these security-oriented implementation measures:
- Password hashing with `bcryptjs`.
- Separate Admin and Teacher session middleware.
- Server-side authentication and authorization checks.
- Request validation using Zod.
- Security headers through Helmet.
- CORS configuration.
- Rate limiting on selected endpoints.
- Hashed QR/text-code token storage.
- Hashed device-token storage for device controls.
- Database uniqueness constraints for duplicate attendance prevention.
- Attendance-attempt and selected audit-event records.
- Login lockout models for Admin and Teacher accounts.

### Important Security Notes
- Frontend route guards do not replace backend authorization.
- Protected APIs must verify identity and permissions.
- Teacher ownership checks must protect teacher-specific records.
- CORS is not a substitute for CSRF protection.
- Browser geolocation can be inaccurate or manipulated.
- Fullscreen and tab-switch monitoring may be bypassed or behave differently across browsers.
- Per-instance rate limits may not create a shared global limit across multiple instances without a shared store.
- High-concurrency capacity must be measured using realistic load tests.
- Security scanner findings should be reviewed, triaged, fixed, and retested.

No application should be described as completely unhackable. Security requires ongoing review, testing, and monitoring.

---

## Testing and Validation

Execute tests in the intended environment and record the date, setup, expected result, actual result, and evidence.

| Test area | Suggested validation |
| :--- | :--- |
| **Admin authentication** | Valid/invalid login, logout, and protected routes |
| **Teacher authentication** | Login, logout, session handling, and account status restrictions |
| **Teacher management** | Teacher creation and status/approval changes |
| **Session management** | Create, update, close, and verify ownership |
| **QR attendance** | Valid, invalid, and expired QR tokens |
| **Text-code attendance** | Valid, invalid, and expired text codes |
| **Campus geofence** | Inside-zone, outside-zone, stale, and inaccurate location |
| **Symbol challenge** | Correct/wrong answers, expiry, and attempt limits |
| **Duplicate attendance** | Submit one student's attendance more than once in a session |
| **Device controls** | Verify session-specific lock and violation handling |
| **Database** | Persistence, unique constraints, relations, and migrations |
| **API security** | Unauthorized access, invalid input, and rate-limited requests |
| **Deployment** | Frontend, backend health, database connectivity, browser workflows |
| **Security headers** | Inspect response headers and review scanner findings |
| **Performance** | Controlled load tests, response time, errors, and DB connections |

This is a test plan, not a claim that every test has passed. Mark a test as Pass only after executing it and recording the result.

---

## Known Considerations

- Location verification depends on browser/device location services and reported accuracy.
- A campus geofence checks a reported coordinate against a configured zone; it does not independently establish classroom-level identity.
- A symbol challenge adds another verification step but is not standalone identity proof.
- Device controls are session-specific and depend on the browser-provided device token.
- Free-tier hosting, database connection limits, and cold starts can affect response times.
- Any claim about simultaneous student capacity requires measured load-test evidence.
- Optional media and email integrations depend on deployment configuration.

---

## Future Enhancements

Potential future improvements:
- Automated unit, integration, and end-to-end test coverage.
- Repeatable security regression testing.
- Load testing and database connection optimization.
- Attendance analytics and downloadable reports.
- Improved administrative monitoring and audit views.
- Accessibility and usability improvements.
- Operational monitoring, alerting, and backup/restore exercises.

---

## Contributing

Suggestions and bug reports are welcome.

1. Fork the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```
3. Make and test your changes.
4. Commit with a clear message:
   ```bash
   git commit -m "Describe your change"
   ```
5. Push your branch:
   ```bash
   git push origin feature/your-feature
   ```
6. Open a pull request describing the change and tests performed.

Do not include credentials, private user data, or production database dumps in issues or pull requests.

---

## Project Information

- **Project:** AttendX — Smart Attendance Management System
- **Author:** Abhishek Kumar
- **Academic Programme:** MCA
- **Institution:** Graphic Era (Deemed to be University), Dehradun
- **Repository:** [github.com/abhi238466/AttendX](https://github.com/abhi238466/AttendX)
- **Branch reviewed:** `main`

<p align="center">
  <strong>AttendX — Making Attendance Management Smarter.</strong>
</p>