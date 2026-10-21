import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { prisma } from './config/prisma.js'
import { sessionMiddleware } from './config/session.js'
import { teacherSessionMiddleware } from './config/teacherSession.js'
import adminAuthRouter from './adminAuth.js'
import adminTeachersRouter from './routes/adminTeachers.js'
import adminUploadsRouter from './routes/adminUploads.js'
import teacherAuthRouter from './teacherAuth.js'
import teacherSessionsRouter from './routes/teacherSessions.js'
import teacherAttendanceRouter from './routes/teacherAttendance.js'

const app = express()

const PORT = Number(process.env.PORT) || 5000
const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173'

const isProduction = process.env.NODE_ENV === 'production'

app.disable('x-powered-by')

// Production reverse proxy support (Render)
if (isProduction) {
  app.set('trust proxy', 1)
}

app.use(helmet())

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
)

app.use(express.json({ limit: '20kb' }))

// Admin routes use the existing Admin session.
app.use(
  '/api/auth/admin',
  sessionMiddleware,
  adminAuthRouter
)

app.use(
  '/api/admin/teachers',
  sessionMiddleware,
  adminTeachersRouter
)

app.use(
  '/api/admin/uploads',
  sessionMiddleware,
  adminUploadsRouter
)

// Teacher authentication uses a separate session and cookie.
app.use(
  '/api/auth/teacher',
  teacherSessionMiddleware,
  teacherAuthRouter
)

// Teacher attendance-session management.
// All routes use the separate Teacher session middleware.
app.use(
  '/api/teacher/sessions',
  teacherSessionMiddleware,
  teacherSessionsRouter
)

// Student attendance submission.
// Students do not need an account or login.
app.use(
  '/api/attendance',
  teacherAttendanceRouter
)

// Basic backend health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AttendX backend is running 🚀',
    status: 'healthy',
  })
})

// Database health check
app.get('/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    res.status(200).json({
      success: true,
      message: 'AttendX database connected successfully! 🎉',
      database: 'Supabase PostgreSQL',
      status: 'connected',
    })
  } catch (error) {
    console.error('❌ Database health check failed:', error.message)

    res.status(503).json({
      success: false,
      message: 'Database connection failed',
      status: 'disconnected',
    })
  }
})

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  })
})

// Central error handler
app.use((err, req, res, next) => {
  console.error('❌ Backend error:', err.message)

  if (res.headersSent) {
    return next(err)
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  })
})

// Start backend and verify database connection
const server = app.listen(PORT, async () => {
  console.log('')
  console.log('╔════════════════════════════════════════╗')
  console.log('║          🚀 ATTENDX BACKEND            ║')
  console.log('╠════════════════════════════════════════╣')
  console.log(`║  🌐 Server: http://localhost:${PORT}`)
  console.log('║  💚 API:    /health')
  console.log('║  🐘 DB:     /health/db')
  console.log('║  👨‍🏫 Teachers: /api/admin/teachers')
  console.log('║  🖼️ Admin uploads: /api/admin/uploads')
  console.log('║  🔐 Teacher login: /api/auth/teacher/login')
  console.log('║  📚 Teacher sessions: /api/teacher/sessions')
  console.log('║  🎓 Student attendance: /api/attendance/submit')
  console.log('╚════════════════════════════════════════╝')

  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`

    console.log('')
    console.log('╔════════════════════════════════════════╗')
    console.log('║       🗄️ ATTENDX DATABASE STATUS       ║')
    console.log('╠════════════════════════════════════════╣')
    console.log('║  🐘 PostgreSQL : ✅ Connected          ║')
    console.log('║  ☁️ Supabase   : ✅ Reachable          ║')
    console.log('║  ⚡ Prisma     : ✅ Ready              ║')
    console.log('╚════════════════════════════════════════╝')
    console.log('🎉 AttendX backend is ready!')
    console.log('')
  } catch (error) {
    console.error('')
    console.error('╔════════════════════════════════════════╗')
    console.error('║       ❌ DATABASE CONNECTION ERROR     ║')
    console.error('╚════════════════════════════════════════╝')
    console.error('🔍 Details:', error.message)
    console.error('⚠️ Backend started, but database is unavailable.')
    console.error('')
  }
})

// Graceful shutdown
let isShuttingDown = false

async function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log('\n🛑 Shutting down AttendX backend...')

  server.close(async () => {
    try {
      await prisma.$disconnect()
      console.log('✅ Database disconnected safely')
      process.exitCode = 0
    } catch (error) {
      console.error('❌ Shutdown error:', error.message)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
