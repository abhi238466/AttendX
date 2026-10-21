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

// Production reverse proxy support (Render).
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


 // Student attendance and teacher-only manual attendance.
 // Session middleware reads the teacher session cookie.
 // Public QR/challenge/submit routes remain accessible without login.
app.use(
  '/api/attendance',
  teacherSessionMiddleware,
  teacherAttendanceRouter
)


// Basic backend health check.
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AttendX backend is running 🚀',
    status: 'healthy',
  })
})

// Database health check.
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
    console.error(
      '❌ Database health check failed:',
      error.message
    )

    res.status(503).json({
      success: false,
      message: 'Database connection failed',
      status: 'disconnected',
    })
  }
})

// Handle unknown routes.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  })
})

// Central error handler.
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

let server
let isShuttingDown = false
let attendanceLockCleanupTimer

const ATTENDANCE_LOCK_CLEANUP_INTERVAL_MS = 30 * 1000

// Close expired attendance sessions and release only their device locks.
// Attendance records are intentionally preserved.
async function cleanupExpiredAttendanceSessions() {
  const now = new Date()

  const expiredSessions = await prisma.attendanceSession.findMany({
    where: {
      status: 'ACTIVE',
      endsAt: { lte: now },
    },
    select: {
      id: true,
    },
    take: 200,
  })

  for (const expiredSession of expiredSessions) {
    await prisma.$transaction(async (tx) => {
      // Serialize expiry cleanup against attendance submissions and manual closure.
      await tx.$queryRaw`
        SELECT id
        FROM "AttendanceSession"
        WHERE id = ${expiredSession.id}::uuid
        FOR UPDATE
      `

      const currentSession = await tx.attendanceSession.findUnique({
        where: { id: expiredSession.id },
        select: {
          id: true,
          status: true,
          endsAt: true,
        },
      })

      const cleanupTime = new Date()

      if (
        !currentSession ||
        currentSession.status !== 'ACTIVE' ||
        !currentSession.endsAt ||
        currentSession.endsAt > cleanupTime
      ) {
        return
      }

      await tx.attendanceSession.update({
        where: { id: currentSession.id },
        data: { status: 'CLOSED' },
      })

      await tx.qrCodeToken.updateMany({
        where: {
          attendanceSessionId: currentSession.id,
          expiresAt: { gt: cleanupTime },
        },
        data: { expiresAt: cleanupTime },
      })

      await tx.attendanceDeviceLock.deleteMany({
        where: {
          attendanceSessionId: currentSession.id,
        },
      })
    })
  }

  if (expiredSessions.length > 0) {
    console.log(
      `🧹 Expired attendance-session cleanup checked ${expiredSessions.length} session(s).`
    )
  }
}

function startAttendanceLockCleanup() {
  const runCleanup = async () => {
    try {
      await cleanupExpiredAttendanceSessions()
    } catch (error) {
      console.error(
        '❌ Expired attendance-session cleanup failed:',
        error.message
      )
    }
  }

  // Run once on startup, then periodically while the server is running.
  void runCleanup()

  attendanceLockCleanupTimer = setInterval(
    () => void runCleanup(),
    ATTENDANCE_LOCK_CLEANUP_INTERVAL_MS
  )

  // Do not keep the process alive solely for this timer.
  attendanceLockCleanupTimer.unref?.()
}

// Start the backend and verify the database connection.
async function startServer() {
  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`

    startAttendanceLockCleanup()

    server = app.listen(PORT, () => {
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

      console.log('')
      console.log('╔════════════════════════════════════════╗')
      console.log('║       🗄️ ATTENDX DATABASE STATUS       ║')
      console.log('╠════════════════════════════════════════╣')
      console.log('║  🐘 PostgreSQL : ✅ Connected          ║')
      console.log('║  ☁️ Supabase   : ✅ Reachable           ║')
      console.log('║  ⚡ Prisma     : ✅ Ready               ║')
      console.log('╚════════════════════════════════════════╝')
      console.log('🎉 AttendX backend is ready!')
      console.log('')
    })

    server.on('error', (error) => {
      console.error('❌ Backend server error:', error.message)
      process.exitCode = 1
    })
  } catch (error) {
    console.error('')
    console.error('╔════════════════════════════════════════╗')
    console.error('║       ❌ DATABASE CONNECTION ERROR     ║')
    console.error('╚════════════════════════════════════════╝')
    console.error('🔍 Details:', error.message)
    console.error('⚠️ Backend could not start because the database is unavailable.')
    console.error('')

    try {
      await prisma.$disconnect()
    } catch (disconnectError) {
      console.error(
        '❌ Database disconnect error:',
        disconnectError.message
      )
    }

    process.exitCode = 1
  }
}

// Graceful shutdown.
async function shutdown(signal) {
  if (isShuttingDown) return

  isShuttingDown = true

  if (attendanceLockCleanupTimer) {
    clearInterval(attendanceLockCleanupTimer)
    attendanceLockCleanupTimer = undefined
  }

  console.log(`\n🛑 Received ${signal}. Shutting down AttendX backend...`)

  if (!server) {
    try {
      await prisma.$disconnect()
      console.log('✅ Database disconnected safely')
    } catch (error) {
      console.error('❌ Shutdown error:', error.message)
      process.exitCode = 1
    }

    return
  }

  server.close(async (serverError) => {
    try {
      await prisma.$disconnect()

      if (serverError) {
        console.error(
          '❌ Server shutdown error:',
          serverError.message
        )
        process.exitCode = 1
      } else {
        console.log('✅ Database disconnected safely')
      }
    } catch (error) {
      console.error('❌ Shutdown error:', error.message)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

void startServer()