
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { prisma } from './config/prisma.js'
import { sessionMiddleware } from './config/session.js'
import adminAuthRouter from './adminAuth.js'
import adminTeachersRouter from './routes/adminTeachers.js'
import adminUploadsRouter from './routes/adminUploads.js'

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

// Session middleware must run before authenticated routes.
app.use(sessionMiddleware)

// Admin authentication routes
app.use('/api/auth/admin', adminAuthRouter)

// Admin Teacher Management routes
app.use('/api/admin/teachers', adminTeachersRouter)

// Admin profile photo upload route
app.use('/api/admin/uploads', adminUploadsRouter)

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
