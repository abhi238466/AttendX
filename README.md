# AttendX — Smart Attendance Management System

<p align="center">
  <strong>A smarter, simpler, and more organized way to manage classroom attendance.</strong>
</p>

<p align="center">
  <img src="frontend/public/attendex.png" alt="AttendX Logo" width="110" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Deployment-Vercel%20%7C%20Render-black" alt="Deployment" />
</p>

---

## About AttendX

**AttendX** is a web-based classroom attendance management system designed to simplify attendance tracking, classroom session management, and attendance record maintenance.

The application uses a React and Vite frontend, a Node.js and Express backend, and PostgreSQL managed through Prisma ORM.

AttendX is designed around teacher-created attendance sessions. Students can enter a session using a dynamic QR code or text code and complete additional verification steps before their attendance is recorded.

The project focuses on usability, server-side access control, reliable attendance records, and a responsive interface.

---

## Key Features

- **Teacher Authentication** — Session-based authentication for teacher accounts.
- **Admin Management** — Administrative controls for managing teacher accounts and campus geofence settings.
- **Teacher Approval** — Teacher account requests can be managed through an administrative approval workflow.
- **Attendance Sessions** — Create, manage, update, and close classroom attendance sessions.
- **Dynamic QR Attendance** — QR-based session entry with time-limited tokens.
- **Text-Code Attendance** — An alternative attendance entry method using session codes.
- **Campus Geofence Verification** — Validate student location against configured active campus zones.
- **Symbol Verification** — Short-lived symbol challenges add an additional classroom verification step.
- **Device and Duplicate Protection** — Server-side checks help prevent repeated attendance submissions.
- **Manual Attendance Management** — Authorized teachers can add, update, and remove attendance records.
- **Attendance History** — Review previously recorded attendance and session information.
- **Teacher Data Isolation** — Server-side ownership checks are designed to protect teacher-specific records.
- **Responsive Interface** — User interface designed for desktop, tablet, and mobile devices.

> *Feature availability depends on the current source code, database configuration, and deployment status. Security and performance must be verified through testing before production-readiness claims are made.*

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React, Vite, JavaScript, CSS |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL |
| **ORM** | Prisma ORM |
| **Authentication** | Express Session |
| **Session Storage** | PostgreSQL session store |
| **Security** | Helmet, CORS, Express Rate Limit, bcryptjs, server-side validation |
| **Media Integration** | Cloudinary, where configured |
| **Email Integration** | Resend, where configured |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Render |
| **Version Control** | Git and GitHub |

---

## System Architecture

```text
                    ┌──────────────────────────┐
                    │       User Browser       │
                    │    Desktop / Mobile      │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │       React + Vite       │
                    │         Frontend         │
                    │          Vercel          │
                    └────────────┬─────────────┘
                                 │ HTTPS / API
                                 ▼
                    ┌──────────────────────────┐
                    │    Node.js + Express     │
                    │        Backend API       │
                    │          Render          │
                    └────────────┬─────────────┘
                                 │ Prisma ORM
                                 ▼
                    ┌──────────────────────────┐
                    │        PostgreSQL        │
                    │  Sessions & Attendance   │
                    └──────────────────────────┘
```

---

## Project Structure

The following represents the main project structure. Individual files may change during development.

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
│
├── frontend/
│   ├── public/
│   │   └── attendex.png
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── .gitignore
│
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites
Install the following before running AttendX locally:
- Node.js and npm
- PostgreSQL database
- Git
- Visual Studio Code or another code editor

### 1. Clone the Repository
```bash
git clone https://github.com/abhi238466/AttendX.git
cd AttendX
```

### 2. Configure the Backend
Open a terminal:
```bash
cd backend
npm install
```

Create a `backend/.env` file.

**Example configuration:**
```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_long_random_secret_at_least_32_characters
```

> Add any additional environment variables required by enabled integrations.

⚠️ **Important:** Never commit `.env` files, database credentials, passwords, API keys, session secrets, or private service credentials to GitHub.

### 3. Generate Prisma Client
Run from the backend directory:
```bash
npx prisma generate
```

### 4. Apply Database Migrations
For a development database:
```bash
npx prisma migrate dev
```

For production, use the reviewed production migration workflow:
```bash
npx prisma migrate deploy
```

> Do not run development migrations against a production database.

### 5. Start the Backend
Use the script configured in `backend/package.json`.

If a start script exists:
```bash
npm start
```

For development, if configured:
```bash
npm run dev
```

### 6. Configure the Frontend
Open a second terminal:
```bash
cd frontend
npm install
```

Create a `frontend/.env` file.

**Example:**
```env
VITE_API_BASE_URL=http://localhost:5000
```

> Use the exact variable name expected by your frontend configuration.

⚠️ **Never put database credentials, session secrets, private API keys, or service-role keys in frontend environment variables. Vite exposes `VITE_` variables to browser code.**

### 7. Start the Frontend
```bash
npm run dev
```

Open the local URL printed by Vite, typically:
`http://localhost:5173`

---

## Deployment

AttendX uses the following intended hosting architecture:

| Component | Platform |
|---|---|
| **Frontend** | Vercel |
| **Backend API** | Render |
| **Database** | PostgreSQL |

### Deployment Checklist
Before deploying:
- [ ] Configure the production frontend API URL.
- [ ] Set the backend `FRONTEND_URL` to the exact frontend origin.
- [ ] Configure `DATABASE_URL` and a strong `SESSION_SECRET` in Render environment settings.
- [ ] Configure additional integration variables only when required.
- [ ] Verify HTTPS, CORS credentials, secure cookies, and CSRF protection.
- [ ] Review and apply database migrations safely.
- [ ] Verify backend authentication and authorization for Admin and Teacher APIs.
- [ ] Test teacher-specific data ownership.
- [ ] Test QR and text-code expiry.
- [ ] Test symbol challenge expiry and regeneration.
- [ ] Test duplicate attendance and device locking.
- [ ] Test campus geofence validation.
- [ ] Test session closure and attendance history.
- [ ] Test authorized and unauthorized attendance record modifications.
- [ ] Confirm that private credentials are not exposed in frontend builds or GitHub.
- [ ] Run load tests and verify database connection limits before making capacity claims.

> *Deployment is not considered production-ready until the relevant security, integration, and performance checks have passed.*

---

## Security Considerations

AttendX uses security-oriented implementation patterns such as password hashing, server-managed sessions, security headers, CORS configuration, request validation, and rate limiting.

**Important security principles:**
- **Backend Authentication:** Protected Admin and Teacher APIs must verify authentication on the server. Frontend route protection alone is insufficient.
- **Authorization:** Every protected resource must verify that the requesting user has permission to access or modify it.
- **Teacher Data Isolation:** Teachers must not be able to access another teacher's records by changing request IDs.
- **Secret Protection:** Database credentials, session secrets, and private API keys must remain server-side.
- **Database Privacy:** Database permissions, public API exposure, and Row Level Security policies must be reviewed and correctly configured.
- **CSRF Protection:** CORS alone does not protect state-changing requests against CSRF.
- **Rate Limiting:** Authentication and attendance endpoints need appropriate rate limits and a suitable shared store when multiple backend instances are used.
- **Location Validation:** Browser GPS can be inaccurate or manipulated. Geolocation is a risk signal, not absolute proof of physical presence.
- **Concurrency Testing:** High-concurrency capacity must be demonstrated through realistic load testing.

> *No application can honestly be guaranteed to be completely unhackable. Security should be evaluated through configuration reviews, authorization tests, and repeatable security testing.*

---

## Project Goals

- Simplify classroom attendance management.
- Reduce repetitive manual attendance work.
- Provide organized attendance history.
- Support QR-code and text-code attendance.
- Maintain teacher-specific data access.
- Improve classroom verification.
- Deliver a responsive user experience.
- Improve reliability under concurrent classroom usage through measured performance testing.

---

## Future Improvements

Potential future improvements include:
- Attendance analytics and reporting.
- Exportable attendance reports.
- Expanded automated security and integration tests.
- Improved administrative monitoring.
- Performance optimization based on load-test results.

---

## Contributing

Suggestions, bug reports, and improvements are welcome.
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Make your changes and commit (`git commit -m 'Add some feature'`).
4. Run relevant tests.
5. Push to the branch (`git push origin feature/your-feature`).
6. Submit a pull request describing your changes.

---

## Author

**Abhishek Kumar**  
MCA Student | Full-Stack Development  
GitHub: [@abhi238466](https://github.com/abhi238466)

<p align="center">
  <strong>AttendX — Making Attendance Management Smarter.</strong>
</p>