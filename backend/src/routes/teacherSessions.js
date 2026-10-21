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
const TOKEN_LIFETIME_SECONDS = 50

const createSessionSchema = z.object({
  courseName: z.string().trim().min(2).max(150),
  subjectName: z.string().trim().min(1).max(150),
  className: z.string().trim().max(100).optional(),
  roomName: z.string().trim().max(100).optional(),
  scheduledStartsAt: z.string().datetime({ offset: true }),
  scheduledEndsAt: z.string().datetime({ offset: true }),

  sections: z
    .array(z.string().trim().min(1).max(50))
    .min(1)
    .max(30),

  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  locationAccuracyMeters: z.number().finite().positive().max(50),
  locationCapturedAt: z.string().datetime({ offset: true }),

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
    subjectName: attendanceSession.subjectName,
    className: attendanceSession.className,
    roomName: attendanceSession.roomName,
    locationAccuracyMeters: attendanceSession.locationAccuracyMeters,
    locationCapturedAt: attendanceSession.locationCapturedAt,
    scheduledStartsAt: attendanceSession.scheduledStartsAt,
    scheduledEndsAt: attendanceSession.scheduledEndsAt,
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
  const letters =
    String.fromCharCode(65 + randomInt(0, 26)) +
    String.fromCharCode(65 + randomInt(0, 26))
  const digits = String(randomInt(0, 1_000_000)).padStart(6, '0')

  return `${letters}${digits}`
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
    const scheduledStartsAt = new Date(input.scheduledStartsAt)
    const scheduledEndsAt = new Date(input.scheduledEndsAt)
    const locationCapturedAt = new Date(input.locationCapturedAt)
    const locationAgeMs = Date.now() - locationCapturedAt.getTime()

    // Require a fresh classroom reading for each new session.
    // This freshness check does not prove the GPS coordinates are authentic.
    // Include timestamp diagnostics so a stale/future reading can be identified
    // from the Network response without weakening the freshness requirement.
    if (
      Number.isNaN(locationCapturedAt.getTime()) ||
      locationAgeMs < -5000 ||
      locationAgeMs > 60_000
    ) {
      return res.status(400).json({
        error: 'Capture your current classroom location again before starting attendance.',
        code: 'LOCATION_READING_STALE',
        details: {
          locationCapturedAt: input.locationCapturedAt,
          serverTime: new Date().toISOString(),
          locationAgeMs: Number.isFinite(locationAgeMs) ? Math.round(locationAgeMs) : null,
          allowedAgeMs: { minimum: -5000, maximum: 60000 },
        },
      })
    }

    if (
      Number.isNaN(scheduledStartsAt.getTime()) ||
      Number.isNaN(scheduledEndsAt.getTime()) ||
      scheduledEndsAt <= scheduledStartsAt
    ) {
      return res.status(400).json({
        error: 'Class end time must be later than class start time.',
      })
    }

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
      // Serialize session creation for this teacher so simultaneous requests
      // cannot both pass the active-session check.
     await tx.$queryRaw`
  SELECT id
  FROM "Teacher"
  WHERE id = ${teacher.id}::uuid
  FOR UPDATE
`

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
          subjectName: input.subjectName,
          className: input.className?.trim() || null,
          roomName: input.roomName?.trim() || null,
          locationAccuracyMeters: input.locationAccuracyMeters,
          locationCapturedAt: new Date(input.locationCapturedAt),
          scheduledStartsAt,
          scheduledEndsAt,
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
            subjectName: attendanceSession.subjectName,
            className: attendanceSession.className,
            roomName: attendanceSession.roomName,
            teacherLatitude: attendanceSession.latitude,
            teacherLongitude: attendanceSession.longitude,
            locationAccuracyMeters: attendanceSession.locationAccuracyMeters,
            locationCapturedAt: attendanceSession.locationCapturedAt.toISOString(),
            sections: attendanceSession.sections,
            scheduledStartsAt: attendanceSession.scheduledStartsAt.toISOString(),
            scheduledEndsAt: attendanceSession.scheduledEndsAt.toISOString(),
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
    // Close this teacher's sessions whose timer has expired.
    // Existing attendance records are not modified or deleted.
    const now = new Date()

    const expiredSessions = await prisma.attendanceSession.findMany({
      where: {
        teacherId: req.teacher.id,
        status: 'ACTIVE',
        endsAt: { lte: now },
      },
      select: { id: true },
    })

    if (expiredSessions.length > 0) {
      const expiredSessionIds = expiredSessions.map(
        (session) => session.id
      )

      await prisma.$transaction(async (tx) => {
        const closedAt = new Date()

        await tx.attendanceSession.updateMany({
          where: {
            id: { in: expiredSessionIds },
            teacherId: req.teacher.id,
            status: 'ACTIVE',
            endsAt: { lte: closedAt },
          },
          data: {
            status: 'CLOSED',
          },
        })

        await tx.qrCodeToken.updateMany({
          where: {
            attendanceSessionId: { in: expiredSessionIds },
            expiresAt: { gt: closedAt },
          },
          data: {
            expiresAt: closedAt,
          },
        })

        // Release device locks for sessions whose hard deadline has passed.
        // Attendance records are intentionally preserved.
        await tx.attendanceDeviceLock.deleteMany({
          where: {
            attendanceSessionId: { in: expiredSessionIds },
          },
        })
      })
    }

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
// Create a QR token and a text code valid for at most 50 seconds.
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

      // Preliminary deadline check. The final token expiry is calculated
      // inside the transaction immediately before token rows are written.
      const preliminaryExpiry = new Date(
        Math.min(
          now.getTime() + TOKEN_LIFETIME_SECONDS * 1000,
          attendanceSession.endsAt.getTime()
        )
      )

      if (preliminaryExpiry <= now) {
        return res.status(409).json({
          error: 'The attendance session has ended.',
        })
      }

      let expiresAt

      // Raw tokens are returned only to the authenticated teacher.
      // A PostgreSQL transaction advisory lock serializes code generation
      // across teachers and backend instances sharing this database.
      let qrToken
      let textCode
      let tokenPairCreated = false

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await prisma.$transaction(async (tx) => {
            // Global lock: do not replace with a JavaScript Set/Map.
            // Return a supported scalar value instead of the PostgreSQL
            // `void` result from pg_advisory_xact_lock. This avoids Prisma's
            // "Failed to deserialize column of type 'void'" error.
            await tx.$queryRaw`
              SELECT 1 AS locked
              FROM (SELECT pg_advisory_xact_lock(73829104)) AS lock_call
            `

            // Also lock this session so simultaneous rotations for the same
            // teacher/session cannot leave two current token pairs.
            await tx.$queryRaw`
              SELECT id
              FROM "AttendanceSession"
              WHERE id = ${attendanceSession.id}::uuid
              FOR UPDATE
            `

            const currentSession = await tx.attendanceSession.findUnique({
              where: { id: attendanceSession.id },
              select: {
                status: true,
                startsAt: true,
                endsAt: true,
              },
            })

            const transactionNow = new Date()

            if (
              !currentSession ||
              currentSession.status !== 'ACTIVE' ||
              currentSession.startsAt > transactionNow ||
              !currentSession.endsAt ||
              currentSession.endsAt <= transactionNow
            ) {
              const error = new Error(
                'This session has ended or is not active.'
              )
              error.code = 'SESSION_NOT_ACTIVE'
              throw error
            }

            // Remove expired rows; they cannot be used again.
            await tx.qrCodeToken.deleteMany({
              where: {
                expiresAt: { lte: transactionNow },
              },
            })

            // Generate a code under the global DB lock and check its hash
            // before inserting. This prevents active codes from being shared
            // by different teachers even when requests arrive together.
            let uniqueTextCode = null

            for (let codeAttempt = 0; codeAttempt < 30; codeAttempt += 1) {
              const candidate = generateTextCode()
              const existing = await tx.qrCodeToken.findFirst({
                where: {
                  tokenHash: hashToken(candidate),
                  expiresAt: { gt: transactionNow },
                },
                select: { id: true },
              })

              if (!existing) {
                uniqueTextCode = candidate
                break
              }
            }

            if (!uniqueTextCode) {
              const error = new Error(
                'Could not generate a unique attendance code. Please retry.'
              )
              error.code = 'TEXT_CODE_GENERATION_FAILED'
              throw error
            }

            // Calculate validity as late as possible so transaction delays
            // do not silently shorten the new code's intended lifetime.
            const tokenCreatedAt = new Date()
            expiresAt = new Date(
              Math.min(
                tokenCreatedAt.getTime() + TOKEN_LIFETIME_SECONDS * 1000,
                currentSession.endsAt.getTime()
              )
            )

            if (expiresAt <= tokenCreatedAt) {
              const error = new Error('The attendance session has ended.')
              error.code = 'SESSION_NOT_ACTIVE'
              throw error
            }

            qrToken = randomBytes(32).toString('base64url')
            textCode = uniqueTextCode

            // Revoke the previous pair for this session, then save the new
            // QR and text code atomically. Any failure rolls this back.
            await tx.qrCodeToken.updateMany({
              where: {
                attendanceSessionId: attendanceSession.id,
                expiresAt: { gt: tokenCreatedAt },
              },
              data: {
                expiresAt: transactionNow,
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

          tokenPairCreated = true
          break
        } catch (error) {
          if (error?.code === 'SESSION_NOT_ACTIVE') {
            return res.status(409).json({
              error: 'This session has ended or is not active.',
            })
          }

          if (error?.code === 'TEXT_CODE_GENERATION_FAILED') {
            return res.status(503).json({ error: error.message })
          }

          // A database unique constraint can still catch a collision,
          // including an exceptionally unlikely QR-token hash collision.
          if (error?.code === 'P2002' && attempt < 4) {
            continue
          }

          throw error
        }
      }

      if (!tokenPairCreated) {
        return res.status(503).json({
          error: 'Could not generate a unique attendance code. Please retry.',
        })
      }

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
          await tx.attendanceDeviceLock.deleteMany({
            where: {
              attendanceSessionId: attendanceSession.id,
            },
          })

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

        // Remove only this session's device locks; keep attendance history.
        await tx.attendanceDeviceLock.deleteMany({
          where: {
            attendanceSessionId: attendanceSession.id,
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