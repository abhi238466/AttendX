import { Router } from 'express'
import {
  createHash,
  randomBytes,
} from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import {
  calculateDistanceMeters,
  isWithinRadius,
} from '../utils/haversine.js'
import { requireTeacher } from '../teacherAuth.js'

const router = Router()

const CHALLENGE_LIFETIME_SECONDS = 60
const MAX_LOCATION_ACCURACY_METERS = 50

const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  // Students in one classroom may share the same public IP address.
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please wait one minute and try again.',
  },
})

const challengeSchema = z.object({
  attendanceSessionId: z.string().uuid().optional(),
  token: z.string().trim().min(1).max(500),
  deviceToken: z.string().trim().min(32).max(200),
}).superRefine((data, ctx) => {
  const isTextCode = /^[A-Z]{2}\d{6}$/i.test(data.token.trim())

  if (!isTextCode && !data.attendanceSessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attendanceSessionId'],
      message: 'A session ID is required for QR verification.',
    })
  }
})

const attendanceSchema = z.object({
  attendanceSessionId: z.string().uuid(),
  challengeToken: z.string().trim().min(1).max(500),
  deviceToken: z.string().trim().min(32).max(200),
  fullName: z.string().trim().min(2).max(120),
  classRollNumber: z.string().trim().min(1).max(50),
  universityRollNumber: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(50),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  locationAccuracyMeters: z.number().finite().positive().max(10000),
  // Client capture time is checked for freshness; it is not trusted as identity proof.
  locationCapturedAt: z.string().datetime({ offset: true }),
})

function hashToken(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeRollNumber(value) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function normalizeSection(value) {
  return value.trim().toUpperCase()
}

function fail(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  })
}

function getSessionDeadline(session) {
  const deadlines = [
    session.endsAt,
    session.attendanceWindowEndsAt,
  ].filter(Boolean)

  if (deadlines.length === 0) {
    return null
  }

  return new Date(
    Math.min(...deadlines.map((date) => date.getTime()))
  )
}

function isSessionOpen(session, now = new Date()) {
  const deadline = getSessionDeadline(session)

  return (
    session.status === 'ACTIVE' &&
    session.startsAt <= now &&
    deadline !== null &&
    now < deadline
  )
}

async function logAttempt({
  attendanceSessionId,
  normalizedUniversityRollNumber = null,
  outcome,
  latitude = null,
  longitude = null,
  locationAccuracyMeters = null,
  distanceMeters = null,
  riskFlags = [],
}) {
  if (!attendanceSessionId) return

  try {
    await prisma.attendanceAttempt.create({
      data: {
        attendanceSessionId,
        normalizedUniversityRollNumber,
        outcome,
        latitude,
        longitude,
        locationAccuracyMeters,
        distanceMeters,
        riskFlags,
      },
    })
  } catch (error) {
    console.error(
      'Attendance attempt logging failed:',
      error
    )
  }
}

async function getSession(attendanceSessionId) {
  return prisma.attendanceSession.findUnique({
    where: {
      id: attendanceSessionId,
    },
    select: {
      id: true,
      teacherId: true,
      courseName: true,
      sections: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
      status: true,
      startsAt: true,
      endsAt: true,
      attendanceWindowEndsAt: true,
    },
  })
}

// POST /api/teacher/attendance/challenge
//
// The student must present a currently valid QR token or text code.
// The server issues a short-lived challenge; scanning alone does
// not mark attendance.
router.post(
  '/challenge',
  attendanceLimiter,
  async (req, res) => {
    const parsed = challengeSchema.safeParse(req.body)

    if (!parsed.success) {
      return fail(
        res,
        400,
        'Please scan the current QR code or enter the current text code.'
      )
    }

    const data = parsed.data
    const submittedToken = data.token.trim()
    const isTextCode = /^[A-Z]{2}\d{6}$/i.test(submittedToken)
    const tokenType = isTextCode ? 'TEXT_CODE' : 'QR'
    const normalizedToken = isTextCode
      ? submittedToken.toUpperCase()
      : submittedToken

    try {
      // Text codes resolve to their owning session in the database.
      // Never trust a session ID supplied alongside a text code.
      let attendanceSessionId = data.attendanceSessionId

      if (isTextCode) {
        // A text code must resolve to exactly one active token record.
        // If two teachers happen to receive the same short code at once,
        // never guess which classroom the student intended.
        const textCodeRecords = await prisma.qrCodeToken.findMany({
          where: {
            tokenHash: hashToken(normalizedToken),
            tokenType: 'TEXT_CODE',
            expiresAt: {
              gt: new Date(),
            },
          },
          select: {
            attendanceSessionId: true,
          },
          take: 2,
        })

        if (textCodeRecords.length === 0) {
          return fail(
            res,
            400,
            'This code is invalid or expired. Please enter the current code.'
          )
        }

        if (textCodeRecords.length > 1) {
          console.error(
            'Active text-code collision detected. Refusing ambiguous attendance lookup.'
          )
          return fail(
            res,
            409,
            'This code is being used by more than one active session. Please ask your teacher to refresh the code.'
          )
        }

        attendanceSessionId = textCodeRecords[0].attendanceSessionId
      }

      const session = await getSession(attendanceSessionId)

      if (!session) {
        return fail(res, 404, 'Attendance session was not found.')
      }

      const now = new Date()

      if (!isSessionOpen(session, now)) {
        await logAttempt({
          attendanceSessionId: session.id,
          outcome: 'SESSION_CLOSED',
        })

        return fail(
          res,
          409,
          'This attendance session has ended or is not open.'
        )
      }

      const storedToken = await prisma.qrCodeToken.findFirst({
        where: {
          attendanceSessionId: session.id,
          tokenHash: hashToken(normalizedToken),
          tokenType,
          expiresAt: {
            gt: now,
          },
        },
        select: {
          id: true,
          expiresAt: true,
        },
      })

      if (!storedToken) {
        await logAttempt({
          attendanceSessionId: session.id,
          outcome: 'INVALID_CODE',
        })

        return fail(
          res,
          400,
          'This QR/code is invalid or expired. Please use the latest one.'
        )
      }

      const deadline = getSessionDeadline(session)

      const challengeExpiresAt = new Date(
        Math.min(
          now.getTime() + CHALLENGE_LIFETIME_SECONDS * 1000,
          deadline.getTime()
        )
      )

      if (challengeExpiresAt <= now) {
        return fail(
          res,
          409,
          'The attendance session has ended.'
        )
      }

      const rawChallenge = randomBytes(32).toString('base64url')

      // Serialize challenge creation against session closure and token rotation.
      // Store only the challenge hash, never the raw secret.
      const challenge = await prisma.$transaction(async (tx) => {
        // The same session-row lock should be used by close/rotation routes.
        // If closure happens first, this transaction sees the closed session.
        await tx.$queryRaw`
          SELECT id
          FROM "AttendanceSession"
          WHERE id = ${session.id}::uuid
          FOR UPDATE
        `

        const currentSession =
          await tx.attendanceSession.findUnique({
            where: {
              id: session.id,
            },
            select: {
              status: true,
              startsAt: true,
              endsAt: true,
              attendanceWindowEndsAt: true,
            },
          })

        const transactionNow = new Date()

        if (
          !currentSession ||
          !isSessionOpen(currentSession, transactionNow)
        ) {
          return null
        }

        // The QR/text token may have expired or been rotated after the
        // first lookup. Confirm it is still valid before issuing a challenge.
        const currentToken = await tx.qrCodeToken.findFirst({
          where: {
            id: storedToken.id,
            attendanceSessionId: session.id,
            tokenHash: hashToken(normalizedToken),
            tokenType,
            expiresAt: {
              gt: transactionNow,
            },
          },
          select: {
            id: true,
          },
        })

        if (!currentToken) {
          return null
        }

        // Device locks are session-specific, not QR/text-token-specific.
        // Check only after the session and current code have been validated.
        const existingDeviceLock = await tx.attendanceDeviceLock.findUnique({
          where: {
            attendanceSessionId_deviceTokenHash: {
              attendanceSessionId: session.id,
              deviceTokenHash: hashToken(data.deviceToken),
            },
          },
          select: {
            id: true,
          },
        })

        if (existingDeviceLock) {
          return { failure: 'DEVICE_ALREADY_MARKED' }
        }

        const finalDeadline = getSessionDeadline(currentSession)

        const finalExpiry = new Date(
          Math.min(
            transactionNow.getTime() +
              CHALLENGE_LIFETIME_SECONDS * 1000,
            finalDeadline.getTime()
          )
        )

        if (finalExpiry <= transactionNow) {
          return null
        }

        const createdChallenge = await tx.attendanceChallenge.create({
          data: {
            attendanceSessionId: session.id,
            tokenHash: hashToken(rawChallenge),
            expiresAt: finalExpiry,
          },
          select: {
            expiresAt: true,
          },
        })

        return { expiresAt: createdChallenge.expiresAt }
      })

      if (challenge?.failure === 'DEVICE_ALREADY_MARKED') {
        return fail(
          res,
          409,
          'Attendance already marked for this session on this device.'
        )
      }

      if (!challenge) {
        return fail(
          res,
          409,
          'The session ended or the code expired. Please use the latest QR/code.'
        )
      }

      return res.status(201).json({
        success: true,
        message: 'Code verified. Complete the attendance form.',
        attendanceSessionId: session.id,
        sections: session.sections,
        challengeToken: rawChallenge,
        challengeExpiresAt: challenge.expiresAt.toISOString(),
      })
    } catch (error) {
      console.error(
        'Attendance challenge failed:',
        error.message
      )

      return fail(
        res,
        500,
        'Verification could not be completed. Please try again.'
      )
    }
  }
)

// POST /api/teacher/attendance/submit
//
// Requires a challenge issued by the endpoint above.
// The challenge is consumed in the same transaction as the record,
// so it cannot be replayed to create another attendance record.
router.post(
  '/submit',
  attendanceLimiter,
  async (req, res) => {
    const parsed = attendanceSchema.safeParse(req.body)

    if (!parsed.success) {
      return fail(
        res,
        400,
        'Please provide valid attendance details and allow location access.'
      )
    }

    const data = parsed.data

    const normalizedUniversityRollNumber = normalizeRollNumber(
      data.universityRollNumber
    )

    const normalizedSection = normalizeSection(data.section)

    try {
      const session = await getSession(data.attendanceSessionId)

      if (!session) {
        return fail(res, 404, 'Attendance session was not found.')
      }

      const now = new Date()

      if (!isSessionOpen(session, now)) {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'SESSION_CLOSED',
        })

        return fail(
          res,
          409,
          'This attendance session has ended or is not open.'
        )
      }

      const allowedSections = session.sections.map(normalizeSection)

      if (!allowedSections.includes(normalizedSection)) {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'INVALID_DETAILS',
        })

        return fail(
          res,
          400,
          'The selected section is not part of this session.'
        )
      }

      const locationCapturedAt = new Date(data.locationCapturedAt)
      const locationAgeMs = Date.now() - locationCapturedAt.getTime()

      // Reject stale/future-dated browser readings. Client timestamps can be spoofed,
      // so this is a quality check, not proof that the device is physically present.
      if (
        Number.isNaN(locationCapturedAt.getTime()) ||
        locationAgeMs < -5000 ||
        locationAgeMs > 30_000
      ) {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'INACCURATE_LOCATION',
          latitude: data.latitude,
          longitude: data.longitude,
          locationAccuracyMeters: data.locationAccuracyMeters,
          riskFlags: ['LOCATION_READING_STALE_OR_FUTURE'],
        })

        return fail(
          res,
          400,
          'Your location reading is too old. Capture your current location again.'
        )
      }

      if (
        data.locationAccuracyMeters <= 0 ||
        data.locationAccuracyMeters > MAX_LOCATION_ACCURACY_METERS
      ) {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'INACCURATE_LOCATION',
          latitude: data.latitude,
          longitude: data.longitude,
          locationAccuracyMeters: data.locationAccuracyMeters,
          riskFlags: ['LOCATION_ACCURACY_TOO_LOW'],
        })

        return fail(
          res,
          400,
          'Location accuracy is too low. Enable precise location and retry.'
        )
      }

      const distanceMeters = calculateDistanceMeters(
        session.latitude,
        session.longitude,
        data.latitude,
        data.longitude
      )

      // Conservative geofence: distance alone can falsely accept a low-precision fix.
      // Require distance + reported accuracy to fit inside the configured radius.
      // Browser-reported accuracy is not independently verified and can be spoofed.
      const conservativeDistanceMeters =
        distanceMeters + data.locationAccuracyMeters

      if (!isWithinRadius(conservativeDistanceMeters, session.radiusMeters)) {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'OUTSIDE_RADIUS',
          latitude: data.latitude,
          longitude: data.longitude,
          locationAccuracyMeters: data.locationAccuracyMeters,
          distanceMeters: conservativeDistanceMeters,
        })

        return fail(
          res,
          403,
          'You are outside the permitted classroom attendance area.'
        )
      }

      const result = await prisma.$transaction(async (tx) => {
        // Serialize attendance submission against session closure for this session.
        // PostgreSQL row lock prevents a close request from racing past this check.
        await tx.$queryRaw`
          SELECT id
          FROM "AttendanceSession"
          WHERE id = ${session.id}::uuid
          FOR UPDATE
        `

        const transactionNow = new Date()

        // Recheck the hard deadline immediately before accepting
        // the attendance submission.
        const currentSession =
          await tx.attendanceSession.findUnique({
            where: {
              id: session.id,
            },
            select: {
              status: true,
              startsAt: true,
              endsAt: true,
              attendanceWindowEndsAt: true,
            },
          })

        if (
          !currentSession ||
          !isSessionOpen(currentSession, transactionNow)
        ) {
          return {
            failure: 'SESSION_CLOSED',
          }
        }

        // A successful attendance on this device blocks further attempts
        // for this session, even when the QR/text token rotates.
        const existingDeviceLock = await tx.attendanceDeviceLock.findUnique({
          where: {
            attendanceSessionId_deviceTokenHash: {
              attendanceSessionId: session.id,
              deviceTokenHash: hashToken(data.deviceToken),
            },
          },
          select: {
            id: true,
          },
        })

        if (existingDeviceLock) {
          return {
            failure: 'DEVICE_ALREADY_MARKED',
          }
        }

        // Atomic one-time challenge consumption.
        const consumed = await tx.attendanceChallenge.updateMany({
          where: {
            attendanceSessionId: session.id,
            tokenHash: hashToken(data.challengeToken),
            consumedAt: null,
            expiresAt: {
              gt: transactionNow,
            },
          },
          data: {
            consumedAt: transactionNow,
          },
        })

        if (consumed.count !== 1) {
          return {
            failure: 'INVALID_CHALLENGE',
          }
        }

        const record = await tx.attendanceRecord.create({
          data: {
            attendanceSessionId: session.id,
            fullName: data.fullName.trim(),
            classRollNumber: data.classRollNumber.trim(),
            universityRollNumber:
              data.universityRollNumber.trim(),
            normalizedUniversityRollNumber,
            section: normalizedSection,
            latitude: data.latitude,
            longitude: data.longitude,
            locationAccuracyMeters:
              data.locationAccuracyMeters,
            distanceMeters,
            status: 'PRESENT',
          },
          select: {
            id: true,
            fullName: true,
            classRollNumber: true,
            universityRollNumber: true,
            section: true,
            submittedAt: true,
          },
        })

        // Create the lock only after the attendance record has been created.
        // Both writes share this transaction, so failed submissions never lock a device.
        await tx.attendanceDeviceLock.create({
          data: {
            attendanceSessionId: session.id,
            deviceTokenHash: hashToken(data.deviceToken),
          },
        })

        await tx.attendanceAttempt.create({
          data: {
            attendanceSessionId: session.id,
            normalizedUniversityRollNumber,
            outcome: 'ACCEPTED',
            latitude: data.latitude,
            longitude: data.longitude,
            locationAccuracyMeters:
              data.locationAccuracyMeters,
            distanceMeters,
          },
        })

        await tx.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            action: 'ATTENDANCE_MARKED',
            entityType: 'AttendanceRecord',
            entityId: record.id,
            metadata: {
              attendanceSessionId: session.id,
              teacherId: session.teacherId,
              section: normalizedSection,
              distanceMeters: Math.round(distanceMeters),
            },
          },
        })

        return {
          record,
        }
      })

      if (result.failure === 'SESSION_CLOSED') {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'SESSION_CLOSED',
        })

        return fail(
          res,
          409,
          'The attendance deadline has passed.'
        )
      }

      if (result.failure === 'DEVICE_ALREADY_MARKED') {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'DUPLICATE',
          latitude: data.latitude,
          longitude: data.longitude,
          locationAccuracyMeters: data.locationAccuracyMeters,
          riskFlags: ['DEVICE_ALREADY_MARKED'],
        })

        return fail(
          res,
          409,
          'Attendance already marked for this session on this device.'
        )
      }

      if (result.failure === 'INVALID_CHALLENGE') {
        await logAttempt({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber,
          outcome: 'EXPIRED_CODE',
        })

        return fail(
          res,
          409,
          'Your verification has expired or was already used. Scan the current QR/code again.'
        )
      }

      return res.status(201).json({
        success: true,
        message: 'Attendance marked successfully.',
        attendance: result.record,
      })
    } catch (error) {
      if (error?.code === 'P2002') {
        await logAttempt({
          attendanceSessionId: data.attendanceSessionId,
          normalizedUniversityRollNumber,
          outcome: 'DUPLICATE',
          latitude: data.latitude,
          longitude: data.longitude,
          locationAccuracyMeters: data.locationAccuracyMeters,
        })

        return fail(
          res,
          409,
          'Attendance has already been marked for this session.'
        )
      }

      console.error(
        'Attendance submission failed:',
        error.message
      )

      return fail(
        res,
        500,
        'Attendance could not be submitted right now. Please try again.'
      )
    }
  }
)


// Teacher-only manual attendance management.
// These routes are mounted under /api/attendance, but require the teacher session.
const manualAttendanceSchema = z.object({
  attendanceSessionId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  classRollNumber: z.string().trim().min(1).max(50),
  universityRollNumber: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(50),
})

const manualAttendanceUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  classRollNumber: z.string().trim().min(1).max(50).optional(),
  universityRollNumber: z.string().trim().min(1).max(80).optional(),
  section: z.string().trim().min(1).max(50).optional(),
  status: z.enum(['PRESENT', 'REJECTED']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
)

// POST /api/attendance/manual
// Add a teacher-entered attendance record to a session owned by that teacher.
router.post('/manual', requireTeacher, async (req, res, next) => {
  const parsed = manualAttendanceSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Please provide valid student details.',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  const data = parsed.data
  const normalizedUniversityRollNumber = normalizeRollNumber(
    data.universityRollNumber
  )
  const normalizedSection = normalizeSection(data.section)

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "AttendanceSession"
        WHERE id = ${data.attendanceSessionId}::uuid
        FOR UPDATE
      `

      const session = await tx.attendanceSession.findFirst({
        where: {
          id: data.attendanceSessionId,
          teacherId: req.teacher.id,
        },
        select: { id: true, sections: true },
      })

      if (!session) return { notFound: true }

      if (!session.sections.some(
        (section) => normalizeSection(section) === normalizedSection
      )) {
        return { invalidSection: true }
      }

      const record = await tx.attendanceRecord.create({
        data: {
          attendanceSessionId: session.id,
          fullName: data.fullName,
          classRollNumber: data.classRollNumber,
          universityRollNumber: data.universityRollNumber,
          normalizedUniversityRollNumber,
          section: normalizedSection,
          status: 'PRESENT',
        },
        select: {
          id: true,
          attendanceSessionId: true,
          fullName: true,
          classRollNumber: true,
          universityRollNumber: true,
          section: true,
          status: true,
          submittedAt: true,
        },
      })

      await tx.auditLog.create({
        data: {
          actorType: 'TEACHER',
          actorId: req.teacher.id,
          action: 'ATTENDANCE_RECORD_MANUALLY_ADDED',
          entityType: 'AttendanceRecord',
          entityId: record.id,
          metadata: {
            attendanceSessionId: session.id,
            section: normalizedSection,
            source: 'TEACHER_MANUAL_ENTRY',
          },
        },
      })

      return { record }
    })

    if (result.notFound) return fail(res, 404, 'Session not found.')
    if (result.invalidSection) {
      return fail(res, 400, 'The selected section is not part of this session.')
    }

    return res.status(201).json({
      success: true,
      message: 'Student attendance added successfully.',
      attendance: result.record,
    })
  } catch (error) {
    if (error?.code === 'P2002') {
      return fail(res, 409,
        'Attendance already exists for this university roll number in this session.')
    }
    return next(error)
  }
})

// PATCH /api/attendance/records/:recordId/manual
// Edit only a record belonging to a session owned by the authenticated teacher.
router.patch('/records/:recordId/manual', requireTeacher, async (req, res, next) => {
  const recordId = z.string().uuid().safeParse(req.params.recordId)
  const parsed = manualAttendanceUpdateSchema.safeParse(req.body)

  if (!recordId.success || !parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid record ID and update details.',
      details: parsed.success ? undefined : parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  const data = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingRecord = await tx.attendanceRecord.findFirst({
        where: {
          id: recordId.data,
          attendanceSession: { teacherId: req.teacher.id },
        },
        select: {
          id: true,
          attendanceSessionId: true,
          section: true,
          fullName: true,
          classRollNumber: true,
          universityRollNumber: true,
        },
      })

      if (!existingRecord) return { notFound: true }

      await tx.$queryRaw`
        SELECT id
        FROM "AttendanceSession"
        WHERE id = ${existingRecord.attendanceSessionId}::uuid
        FOR UPDATE
      `

      const session = await tx.attendanceSession.findFirst({
        where: {
          id: existingRecord.attendanceSessionId,
          teacherId: req.teacher.id,
        },
        select: { id: true, sections: true },
      })

      if (!session) return { notFound: true }

      const nextSection = data.section
        ? normalizeSection(data.section)
        : normalizeSection(existingRecord.section)

      if (!session.sections.some(
        (section) => normalizeSection(section) === nextSection
      )) {
        return { invalidSection: true }
      }

      const nextUniversityRollNumber =
        data.universityRollNumber ?? existingRecord.universityRollNumber

      const updateData = {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.classRollNumber !== undefined
          ? { classRollNumber: data.classRollNumber }
          : {}),
        ...(data.universityRollNumber !== undefined ? {
          universityRollNumber: data.universityRollNumber,
          normalizedUniversityRollNumber: normalizeRollNumber(nextUniversityRollNumber),
        } : {}),
        ...(data.section !== undefined ? { section: nextSection } : {}),
        ...(data.status !== undefined ? {
          status: data.status,
          correctionReason: 'Updated by the authenticated teacher.',
          correctedByTeacherId: req.teacher.id,
          correctedAt: new Date(),
        } : {}),
      }

      const record = await tx.attendanceRecord.update({
        where: { id: existingRecord.id },
        data: updateData,
        select: {
          id: true,
          attendanceSessionId: true,
          fullName: true,
          classRollNumber: true,
          universityRollNumber: true,
          section: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
          correctionReason: true,
          correctedAt: true,
        },
      })

      await tx.auditLog.create({
        data: {
          actorType: 'TEACHER',
          actorId: req.teacher.id,
          action: 'ATTENDANCE_RECORD_MANUALLY_UPDATED',
          entityType: 'AttendanceRecord',
          entityId: record.id,
          metadata: {
            attendanceSessionId: session.id,
            changedFields: Object.keys(data),
          },
        },
      })

      return { record }
    })

    if (result.notFound) return fail(res, 404, 'Attendance record not found.')
    if (result.invalidSection) {
      return fail(res, 400, 'The selected section is not part of this session.')
    }

    return res.json({
      success: true,
      message: 'Attendance record updated successfully.',
      attendance: result.record,
    })
  } catch (error) {
    if (error?.code === 'P2002') {
      return fail(res, 409,
        'Attendance already exists for this university roll number in this session.')
    }
    return next(error)
  }
})



// DELETE /api/attendance/records/:recordId/manual
// Delete only a record belonging to a session owned by the authenticated teacher.
router.delete('/records/:recordId/manual', requireTeacher, async (req, res, next) => {
  const recordId = z.string().uuid().safeParse(req.params.recordId)

  if (!recordId.success) {
    return fail(res, 400, 'Please provide a valid attendance record ID.')
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingRecord = await tx.attendanceRecord.findFirst({
        where: {
          id: recordId.data,
          attendanceSession: { teacherId: req.teacher.id },
        },
        select: {
          id: true,
          attendanceSessionId: true,
          fullName: true,
          classRollNumber: true,
          universityRollNumber: true,
          section: true,
        },
      })

      if (!existingRecord) return { notFound: true }

      await tx.$queryRaw`
        SELECT id
        FROM "AttendanceSession"
        WHERE id = ${existingRecord.attendanceSessionId}::uuid
        FOR UPDATE
      `

      const session = await tx.attendanceSession.findFirst({
        where: {
          id: existingRecord.attendanceSessionId,
          teacherId: req.teacher.id,
        },
        select: { id: true },
      })

      if (!session) return { notFound: true }

      await tx.attendanceRecord.delete({
        where: { id: existingRecord.id },
      })

      await tx.auditLog.create({
        data: {
          actorType: 'TEACHER',
          actorId: req.teacher.id,
          action: 'ATTENDANCE_RECORD_MANUALLY_DELETED',
          entityType: 'AttendanceRecord',
          entityId: existingRecord.id,
          metadata: {
            attendanceSessionId: session.id,
            fullName: existingRecord.fullName,
            classRollNumber: existingRecord.classRollNumber,
            universityRollNumber: existingRecord.universityRollNumber,
            section: existingRecord.section,
          },
        },
      })

      return { deleted: true }
    })

    if (result.notFound) {
      return fail(res, 404, 'Attendance record not found.')
    }

    return res.json({
      success: true,
      message: 'Attendance record deleted successfully.',
    })
  } catch (error) {
    return next(error)
  }
})

export default router