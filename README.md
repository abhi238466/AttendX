# AttendX — Smart Attendance Management System

<p align="center">
  <strong>A smarter, simpler and more organized way to manage classroom attendance.</strong>
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

**AttendX** is a web-based attendance management system designed to simplify classroom attendance and session management.

The project aims to provide teachers with a centralized platform to manage attendance sessions, record student attendance, and review attendance history. It combines a responsive React frontend with an Express backend and a PostgreSQL database managed through Prisma ORM.

The system is being developed with a focus on usability, session management, access control, and reliable attendance records.

## Key Features

- **Teacher Authentication** — Secure teacher login and session-based access.
- **Attendance Sessions** — Create and manage classroom attendance sessions.
- **QR-Based Attendance** — Support for QR-based attendance workflows.
- **Text-Code Attendance** — Attendance workflows using session codes.
- **Manual Attendance** — Add, edit, and remove attendance records manually.
- **Attendance History** — Review previously recorded attendance.
- **Session Management** — Manage session details and attendance status.
- **Teacher Data Isolation** — Designed to keep teacher-specific records separate.
- **Responsive Interface** — Built for use across desktop, tablet, and mobile screens.
- **Backend Security** — Uses server-side validation, session middleware, and other security controls.

> Feature availability may depend on the current implementation and deployment status.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication & Sessions | Express Session, PostgreSQL session store |
| Security | Helmet, CORS, Express Rate Limit, bcryptjs |
| File & Media Services | Cloudinary integration |
| Email Service | Resend integration |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Version Control | Git and GitHub |

## System Architecture

```text
                 ┌─────────────────────────┐
                 │       User Browser      │
                 │   Desktop / Mobile      │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │    React + Vite UI      │
                 │       Vercel            │
                 └────────────┬────────────┘
                              │ HTTPS / API
                              ▼
                 ┌─────────────────────────┐
                 │    Node.js + Express    │
                 │         Render          │
                 └────────────┬────────────┘
                              │ Prisma ORM
                              ▼
                 ┌─────────────────────────┐
                 │      PostgreSQL         │
                 │  Attendance & Sessions  │
                 └─────────────────────────┘
```

## Project Structure

```text
AttendX/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/
│   │   ├── generated/
│   │   ├── services/
│   │   ├── routes/
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

*The directory listing represents the main project layout; individual files may change as development continues.*

## Getting Started

### Prerequisites

Install the following before running the project locally:

- Node.js and npm
- PostgreSQL database
- Git
- A code editor such as Visual Studio Code

### 1. Clone the Repository

```bash
git clone https://github.com/abhi238466/AttendX.git
cd AttendX
```

### 2. Configure the Backend

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory and configure the environment variables required by the backend.

Example variable names:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_strong_random_secret
```

Configure any additional variables required by your enabled services, such as Cloudinary or email delivery.

**Important:** Replace example values with your own configuration. Never commit `.env` files, passwords, database credentials, API keys, or session secrets to GitHub.

### 3. Generate the Prisma Client

```bash
npx prisma generate
```

Run this command from the `backend` directory.

Ensure your PostgreSQL database is configured and the required schema migrations have been applied before using database-dependent features.

### 4. Start the Backend

```bash
npm start
```

The backend uses the start script defined in `backend/package.json`.

### 5. Configure the Frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create the frontend environment configuration required by the application. For a Vite application, public frontend environment variables typically use the `VITE_` prefix.

For example, if the frontend is configured to read `VITE_API_URL`, set it to your local backend API URL:

```env
VITE_API_URL=http://localhost:5000
```

Use the actual environment variable name expected by the frontend code.

### 6. Start the Frontend

```bash
npm run dev
```

Open the local URL printed by Vite in your terminal.

## Deployment

AttendX is intended to use the following deployment setup:

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend API | Render |
| Database | PostgreSQL |

### Deployment Checklist

- Configure the frontend's production API URL.
- Set the backend's production `FRONTEND_URL` to the deployed frontend origin.
- Configure `DATABASE_URL` and `SESSION_SECRET` in the backend hosting environment.
- Configure any additional environment variables required by enabled integrations.
- Verify session cookie settings, CORS credentials, and HTTPS behavior in production.
- Apply database migrations using the project's migration workflow.
- Test authentication, attendance creation, record editing, record deletion, and attendance submission after deployment.

Deployment is not considered complete until these checks have passed.

## Security Considerations

AttendX incorporates security-oriented implementation choices, including:

- Environment-based configuration for sensitive values.
- Password hashing with bcryptjs.
- Session-based authentication.
- Security headers through Helmet.
- Configurable CORS and rate limiting.
- Server-side validation and authorization checks.

Security depends on correct configuration and testing. Production deployment should include authorization, session management, attendance validation, and database access testing.

## Project Goals

- Simplify classroom attendance management.
- Reduce repetitive manual work.
- Provide a clear attendance history.
- Support QR and text-code attendance workflows.
- Maintain separation between teachers' records.
- Deliver a responsive and accessible user experience.

## Future Improvements

- Enhanced attendance analytics and reporting.
- Exportable attendance reports.
- Improved mobile-device location verification.
- Additional administrative monitoring and audit capabilities.
- Expanded automated tests and security validation.

## Contributing

Suggestions, bug reports, and improvements are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Submit a pull request describing the changes.

## Author

**Abhishek Kumar**

MCA Student | Full-Stack Development

GitHub: [@abhi238466](https://github.com/abhi238466)

---

<p align="center">
  <strong>AttendX — Making Attendance Management Smarter.</strong>
</p>
