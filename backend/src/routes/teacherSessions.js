import { Router } from 'express'
import {
  randomUUID,
  randomBytes,
  randomInt,
  createHash,
} from 'node:crypto'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireTeacher } from '../teacherAuth.js'

const router = Router()

const MIN_RADIUS_METERS = 5
const MAX_RADIUS_METERS = 80
const DEFAULT_RADIUS_METERS = 25
const MAX_SESSION_DURATION_MINUTES = 240
const TOKEN_LIFETIME_SECONDS = 15

const createSessionSchema = z.object({
  courseName: z.string().trim().min(2).max(150),

  sections: z
    .array(z.string().trim().min(1).max(50))
    .min(1)
    .max(30),

  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),

  radiusMeters: z
    .number()
    .int()
    .min(MIN_RADIUS_METERS)
    .max(MAX_RADIUS_METERS)
    .default(DEFAULT_RADIUS_METERS),

  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(MAX_SESSION_DURATION_MINUTES),
})

const tokenRotationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many token rotation requests. Please wait before retrying.',
  },
})

function normalizeSections(sections) {
  const normalized = sections.map((section) => section.trim())

  const unique = new Set(
    normalized.map((section) => section.toLowerCase())
  )

  if (unique.size !== normalized.length) {
    return null
  }

  return normalized
}

function parseSessionId(value) {
  const parsed = z.string().uuid().safeParse(value)
  return parsed.success ? parsed.data : null
}

function sessionHasEnded(attendanceSession) {
  return (
    attendanceSession.status !== 'ACTIVE' ||
    (
      attendanceSession.endsAt &&
      attendanceSession.endsAt.getTime() <= Date.now()
    )
  )
}

function sessionResponse(attendanceSession) {
  return {
    id: attendanceSession.id,
    courseName: attendanceSession.courseName,
    sections: attendanceSession.sections,
    latitude: attendanceSession.latitude,
    longitude: attendanceSession.longitude,
    radiusMeters: attendanceSession.radiusMeters,
    status: sessionHasEnded(attendanceSession)
      ? attendanceSession.status === 'CANCELLED'
        ? 'CANCELLED'
        : 'CLOSED'
      : attendanceSession.status,
    startsAt: attendanceSession.startsAt,
    endsAt: attendanceSession.endsAt,
    createdAt: attendanceSession.createdAt,
    updatedAt: attendanceSession.updatedAt,
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function generateTextCode() {
  const letter = String.fromCharCode(65 + randomInt(0, 26))
  const digits = String(randomInt(0, 10000)).padStart(4, '0')

  return `${letter}${digits}`
}

function getStudentAttendanceUrl(sessionId, token) {
  const frontendUrl =
    process.env.FRONTEND_URL || 'http://localhost:5173'

  const url = new URL('/student/attendance', frontendUrl)

  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('token', token)

  return url.toString()
}

// POST /api/teacher/sessions
// Create a session for the authenticated teacher only.
router.post('/', requireTeacher, async (req, res, next) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid session details.',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const input = parsed.data
    const sections = normalizeSections(input.sections)

    if (!sections) {
      return res.status(400).json({
        error: 'Duplicate sections are not allowed.',
      })
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: req.teacher.id },
      select: {
        id: true,
        status: true,
        mustChangePassword: true,
      },
    })

    if (
      !teacher ||
      teacher.status !== 'ACTIVE' ||
      teacher.mustChangePassword
    ) {
      return res.status(403).json({
        error: 'Your Teacher account is not allowed to create sessions.',
      })
    }

    const now = new Date()

    const endsAt = new Date(
      now.getTime() + input.durationMinutes * 60 * 1000
    )

    const createdSession = await prisma.$transaction(async (tx) => {
      const activeSession = await tx.attendanceSession.findFirst({
        where: {
          teacherId: teacher.id,
          status: 'ACTIVE',
          endsAt: { gt: now },
        },
        select: {
          id: true,
          courseName: true,
        },
      })

      if (activeSession) {
        const error = new Error(
          'Close your current active session before starting another one.'
        )

        error.code = 'ACTIVE_SESSION_EXISTS'
        throw error
      }

      const attendanceSession = await tx.attendanceSession.create({
        data: {
          id: randomUUID(),
          teacherId: teacher.id,
          courseName: input.courseName,
          sections,
          latitude: input.latitude,
          longitude: input.longitude,
          radiusMeters: input.radiusMeters,
          status: 'ACTIVE',
          startsAt: now,
          endsAt,
        },
      })

      await tx.auditLog.create({
        data: {
          actorType: 'TEACHER',
          actorId: teacher.id,
          action: 'ATTENDANCE_SESSION_CREATED',
          entityType: 'AttendanceSession',
          entityId: attendanceSession.id,
          metadata: {
            courseName: attendanceSession.courseName,
            sections: attendanceSession.sections,
            radiusMeters: attendanceSession.radiusMeters,
            durationMinutes: input.durationMinutes,
          },
        },
      })

      return attendanceSession
    })

    return res.status(201).json({
      message: 'Attendance session created successfully.',
      session: sessionResponse(createdSession),
    })
  } catch (error) {
    if (error.code === 'ACTIVE_SESSION_EXISTS') {
      return res.status(409).json({
        error: error.message,
      })
    }

    return next(error)
  }
})

// GET /api/teacher/sessions
// Return only the authenticated teacher's sessions.
router.get('/', requireTeacher, async (req, res, next) => {
  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        teacherId: req.teacher.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    })

    return res.json({
      sessions: sessions.map(sessionResponse),
    })
  } catch (error) {
    return next(error)
  }
})

// POST /api/teacher/sessions/:sessionId/tokens/rotate
// Create a QR token and a text code valid for at most 15 seconds.
// Previous unexpired tokens for this session are revoked atomically.
router.post(
  '/:sessionId/tokens/rotate',
  requireTeacher,
  tokenRotationLimiter,
  async (req, res, next) => {
    try {
      const sessionId = parseSessionId(req.params.sessionId)

      if (!sessionId) {
        return res.status(400).json({
          error: 'Invalid session ID.',
        })
      }

      const teacher = await prisma.teacher.findUnique({
        where: {
          id: req.teacher.id,
        },
        select: {
          id: true,
          status: true,
          mustChangePassword: true,
        },
      })

      if (
        !teacher ||
        teacher.status !== 'ACTIVE' ||
        teacher.mustChangePassword
      ) {
        return res.status(403).json({
          error: 'Your Teacher account is not allowed to rotate tokens.',
        })
      }

      const attendanceSession =
        await prisma.attendanceSession.findFirst({
          where: {
            id: sessionId,
            teacherId: teacher.id,
          },
          select: {
            id: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        })

      if (!attendanceSession) {
        return res.status(404).json({
          error: 'Session not found.',
        })
      }

      const now = new Date()

      if (
        attendanceSession.status !== 'ACTIVE' ||
        attendanceSession.startsAt > now ||
        !attendanceSession.endsAt ||
        attendanceSession.endsAt <= now
      ) {
        return res.status(409).json({
          error: 'This session has ended or is not active.',
        })
      }

      // Never allow a token to outlive the session deadline.
      const expiresAt = new Date(
        Math.min(
          now.getTime() + TOKEN_LIFETIME_SECONDS * 1000,
          attendanceSession.endsAt.getTime()
        )
      )

      const remainingSeconds = Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
      )

      if (remainingSeconds <= 0) {
        return res.status(409).json({
          error: 'The attendance session has ended.',
        })
      }

      // Raw tokens are returned to the teacher but never stored in the DB.
      const qrToken = randomBytes(32).toString('base64url')
      const textCode = generateTextCode()

      await prisma.$transaction(async (tx) => {
        // Revoke previous tokens before inserting the new pair.
        // Even if their old expiry time has not arrived, they can no
        // longer be used once the new pair is generated.
        await tx.qrCodeToken.updateMany({
          where: {
            attendanceSessionId: attendanceSession.id,
            expiresAt: { gt: now },
          },
          data: {
            expiresAt: now,
          },
        })

        await tx.qrCodeToken.createMany({
          data: [
            {
              attendanceSessionId: attendanceSession.id,
              tokenHash: hashToken(qrToken),
              tokenType: 'QR',
              expiresAt,
            },
            {
              attendanceSessionId: attendanceSession.id,
              tokenHash: hashToken(textCode),
              tokenType: 'TEXT_CODE',
              expiresAt,
            },
          ],
        })

        await tx.auditLog.create({
          data: {
            actorType: 'TEACHER',
            actorId: teacher.id,
            action: 'ATTENDANCE_TOKENS_ROTATED',
            entityType: 'AttendanceSession',
            entityId: attendanceSession.id,
            metadata: {
              expiresAt: expiresAt.toISOString(),
              tokenLifetimeSeconds: TOKEN_LIFETIME_SECONDS,
            },
          },
        })
      })

      return res.json({
        message: 'Attendance tokens generated successfully.',
        sessionId: attendanceSession.id,
        qrToken,
        attendanceUrl: getStudentAttendanceUrl(
          attendanceSession.id,
          qrToken
        ),
        textCode,
        expiresAt: expiresAt.toISOString(),
        expiresInSeconds: Math.max(
          0,
          Math.floor((expiresAt.getTime() - Date.now()) / 1000)
        ),
      })
    } catch (error) {
      return next(error)
    }
  }
)

// PATCH /api/teacher/sessions/:sessionId/close
// Close only a session owned by the authenticated teacher.
// Revoke any remaining tokens when the session is closed.
router.patch(
  '/:sessionId/close',
  requireTeacher,
  async (req, res, next) => {
    try {
      const sessionId = parseSessionId(req.params.sessionId)

      if (!sessionId) {
        return res.status(400).json({
          error: 'Invalid session ID.',
        })
      }

      const result = await prisma.$transaction(async (tx) => {
        const attendanceSession =
          await tx.attendanceSession.findFirst({
            where: {
              id: sessionId,
              teacherId: req.teacher.id,
            },
          })

        if (!attendanceSession) {
          return { notFound: true }
        }

        if (attendanceSession.status === 'CANCELLED') {
          return { alreadyCancelled: true }
        }

        if (attendanceSession.status === 'CLOSED') {
          return {
            alreadyClosed: true,
            session: attendanceSession,
          }
        }

        const closedAt = new Date()

        const closedSession = await tx.attendanceSession.update({
          where: {
            id: attendanceSession.id,
          },
          data: {
            status: 'CLOSED',
            endsAt: closedAt,
          },
        })

        await tx.qrCodeToken.updateMany({
          where: {
            attendanceSessionId: attendanceSession.id,
            expiresAt: { gt: closedAt },
          },
          data: {
            expiresAt: closedAt,
          },
        })

        await tx.auditLog.create({
          data: {
            actorType: 'TEACHER',
            actorId: req.teacher.id,
            action: 'ATTENDANCE_SESSION_CLOSED',
            entityType: 'AttendanceSession',
            entityId: closedSession.id,
            metadata: {
              courseName: closedSession.courseName,
            },
          },
        })

        return {
          session: closedSession,
        }
      })

      if (result.notFound) {
        return res.status(404).json({
          error: 'Session not found.',
        })
      }

      if (result.alreadyCancelled) {
        return res.status(409).json({
          error: 'A cancelled session cannot be closed.',
        })
      }

      return res.json({
        message: result.alreadyClosed
          ? 'This session is already closed.'
          : 'Attendance session closed successfully.',
        session: sessionResponse(result.session),
      })
    } catch (error) {
      return next(error)
    }
  }
)

export default router