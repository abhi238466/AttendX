 import { Router } from 'express'
    import {
      createHash,
      randomBytes,
      randomInt,
    } from 'node:crypto'
    import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
    import { z } from 'zod'
    import { prisma } from '../config/prisma.js'
    import {
      calculateDistanceMeters,
      isWithinRadius,
    } from '../utils/haversine.js'
    import { requireTeacher } from '../teacherAuth.js'

    const router = Router()

    const SYMBOL_CHALLENGE_LIFETIME_SECONDS = 25
    const SYMBOL_VERIFY_NETWORK_GRACE_MS = 5000
    const MAX_SYMBOL_WRONG_ATTEMPTS = 3
    const MAX_SYMBOL_SECURITY_VIOLATIONS = 2
    const MAX_LOCATION_ACCURACY_METERS = 100

   const SYMBOL_POOL = [
  'circle',
  'triangle',
  'square',
  'rectangle',
  'diamond',
  'star',
  'hexagon',
  'pentagon',
  'octagon',
  'oval',

  'rhombus',
  'parallelogram',
  'trapezoid',
  'cross',
  'plus',
  'minus',
  'equals',
  'asterisk',
  'semi-circle',
  'quarter-circle',

  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'arrow-up-left',
  'arrow-up-right',
  'arrow-down-left',
  'arrow-down-right',
  'chevron-up',
  'chevron-down',

  'chevron-left',
  'chevron-right',
  'double-arrow',
  'arrow-circle',
  'line-horizontal',
  'line-vertical',
  'line-diagonal',
  'line-zigzag',
  'wave',
  'spiral',

  'cube',
  'sphere',
  'cylinder',
  'cone',
  'pyramid',
  'prism',
  'torus',
  'ring',
  'double-ring',
  'hollow-square',

  'target',
  'bullseye',
  'compass',
  'gear',
  'key',
  'lock',
  'shield',
  'crown',
  'bell',
  'flag',

  'anchor',
  'leaf',
  'bolt',
  'lightning',
  'cloud',
  'sun',
  'moon',
  'mountain',
  'tree',
  'flower',

  'book',
  'bookmark',
  'folder',
  'file',
  'document',
  'calendar',
  'clock',
  'hourglass',
  'calculator',
  'ruler',

  'pencil',
  'pen',
  'scissors',
  'magnifying-glass',
  'telescope',
  'microscope',
  'binoculars',
  'camera',
  'printer',
  'monitor',

  'laptop',
  'keyboard',
  'mouse',
  'smartphone',
  'battery',
  'plug',
  'satellite',
  'globe',
  'map-pin',
  'location-marker',
]

    const attendanceLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 20,
      keyGenerator: (req) => {
        const deviceToken = req.body?.deviceToken
        return deviceToken
          ? hashToken(String(deviceToken))
          : ipKeyGenerator(req.ip)
      },
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many attempts from this device. Please wait one minute and try again.',
      },
    })

    const attendanceIpLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 20000,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many attendance requests from this network. Please retry shortly.',
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

    const symbolAccessSchema = z.object({
      attendanceSessionId: z.string().uuid(),
      challengeToken: z.string().trim().min(1).max(500),
      deviceToken: z.string().trim().min(32).max(200),
      universityRollNumber: z.string().trim().min(1).max(80),
    })

    const symbolChallengeSchema = symbolAccessSchema.extend({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      locationAccuracyMeters: z.number().finite().positive().max(10000),
      locationCapturedAt: z.string().datetime({ offset: true }),
    })

    const symbolVerifySchema = symbolAccessSchema.extend({
      answers: z.array(z.string().trim().min(1).max(30)).length(3),
    })

    const symbolViolationSchema = symbolAccessSchema.extend({
      violationType: z.enum(['FULLSCREEN_EXIT', 'TAB_SWITCH']),
      incidentId: z.string().trim().min(1).max(80),
    })

    const symbolAttendanceSchema = symbolAccessSchema.extend({
      answers: z.array(z.string().trim().min(1).max(30)).length(3),
      fullName: z.string().trim().min(2).max(120),
      classRollNumber: z.string().trim().min(1).max(50),
      section: z.string().trim().min(1).max(50),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      locationAccuracyMeters: z.number().finite().positive().max(10000),
      locationCapturedAt: z.string().datetime({ offset: true }),
    })

    const symbolGenerateSchema = z.object({
      attendanceSessionId: z.string().uuid(),
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

    async function validateCampusGeofence({
      attendanceSessionId,
      normalizedUniversityRollNumber,
      latitude,
      longitude,
      locationAccuracyMeters,
      locationCapturedAt,
      requestReceivedAt,
    }) {
      const capturedAt = new Date(locationCapturedAt)
      const locationAgeMs = requestReceivedAt.getTime() - capturedAt.getTime()

      if (
        Number.isNaN(capturedAt.getTime()) ||
        locationAgeMs < -5000 ||
        locationAgeMs > 30_000
      ) {
        await logAttempt({
          attendanceSessionId,
          normalizedUniversityRollNumber,
          outcome: 'INACCURATE_LOCATION',
          latitude,
          longitude,
          locationAccuracyMeters,
          riskFlags: ['LOCATION_READING_STALE_OR_FUTURE'],
        })

        return {
          success: false,
          status: 400,
          message: 'Your location reading is too old. Capture your current location again.',
        }
      }

      if (
        locationAccuracyMeters <= 0 ||
        locationAccuracyMeters > MAX_LOCATION_ACCURACY_METERS
      ) {
        await logAttempt({
          attendanceSessionId,
          normalizedUniversityRollNumber,
          outcome: 'INACCURATE_LOCATION',
          latitude,
          longitude,
          locationAccuracyMeters,
          riskFlags: ['LOCATION_ACCURACY_TOO_LOW'],
        })

        return {
          success: false,
          status: 400,
          message: 'Location accuracy is too low. Enable precise location and retry.',
        }
      }

      const activeGeofenceZones = await prisma.geofenceZone.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
        },
      })

      if (activeGeofenceZones.length === 0) {
        await logAttempt({
          attendanceSessionId,
          normalizedUniversityRollNumber,
          outcome: 'SUSPICIOUS',
          latitude,
          longitude,
          locationAccuracyMeters,
          riskFlags: ['NO_ACTIVE_GEOFENCE_ZONES'],
        })

        return {
          success: false,
          status: 503,
          message: 'Campus location verification is currently unavailable. Please contact the administrator.',
        }
      }

      let closestConservativeDistanceMeters = Infinity
      let isInsideActiveGeofence = false

      for (const zone of activeGeofenceZones) {
        const zoneDistanceMeters = calculateDistanceMeters(
          zone.latitude,
          zone.longitude,
          latitude,
          longitude
        )

        const zoneConservativeDistanceMeters =
          zoneDistanceMeters + locationAccuracyMeters

        if (zoneConservativeDistanceMeters < closestConservativeDistanceMeters) {
          closestConservativeDistanceMeters = zoneConservativeDistanceMeters
        }

        if (
          isWithinRadius(
            zoneConservativeDistanceMeters,
            zone.radiusMeters
          )
        ) {
          isInsideActiveGeofence = true
        }
      }

      if (!isInsideActiveGeofence) {
        await logAttempt({
          attendanceSessionId,
          normalizedUniversityRollNumber,
          outcome: 'OUTSIDE_RADIUS',
          latitude,
          longitude,
          locationAccuracyMeters,
          distanceMeters: closestConservativeDistanceMeters,
        })

        return {
          success: false,
          status: 403,
          message: 'You are outside the permitted campus attendance area.',
        }
      }

      return {
        success: true,
      }
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
        session.closedAt,
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

    function isSessionAcceptingRequest(session, requestReceivedAt) {
      const deadline = getSessionDeadline(session)

      return (
        (session.status === 'ACTIVE' || session.status === 'CLOSED') &&
        session.startsAt <= requestReceivedAt &&
        deadline !== null &&
        requestReceivedAt < deadline
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

    async function findSuccessfulAttendanceRetry(
      client,
      {
        attendanceSessionId,
        deviceToken,
        normalizedUniversityRollNumber,
      }
    ) {
      return client.symbolChallengeAttempt.findFirst({
        where: {
          symbolChallenge: {
            attendanceSessionId,
          },
          deviceTokenHash: hashToken(deviceToken),
          normalizedUniversityRollNumber,
          attendanceRecordId: {
            not: null,
          },
        },
        select: {
          attendanceRecord: {
            select: {
              id: true,
              fullName: true,
              classRollNumber: true,
              universityRollNumber: true,
              section: true,
              submittedAt: true,
            },
          },
        },
      })
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
          closedAt: true,
        },
      })
    }

    function createSymbolGrid() {
      const shuffledSymbols = [...SYMBOL_POOL]

      for (let index = shuffledSymbols.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(0, index + 1)
        ;[shuffledSymbols[index], shuffledSymbols[swapIndex]] = [
          shuffledSymbols[swapIndex],
          shuffledSymbols[index],
        ]
      }

      const symbols = [
        shuffledSymbols.slice(0, 3),
        shuffledSymbols.slice(3, 6),
        shuffledSymbols.slice(6, 9),
      ]

      const correctAnswers = symbols.map((row) => row[randomInt(0, row.length)])

      return { symbols, correctAnswers }
    }

    async function validateSymbolAccess({
      attendanceSessionId,
      challengeToken,
      deviceToken,
      requestReceivedAt,
    }) {
      const attendanceChallenge = await prisma.attendanceChallenge.findFirst({
        where: {
          attendanceSessionId,
          tokenHash: hashToken(challengeToken),
          consumedAt: null,
          expiresAt: {
            gt: requestReceivedAt,
          },
        },
        select: {
          id: true,
        },
      })

      if (!attendanceChallenge) {
        return { failure: 'INVALID_ATTENDANCE_CHALLENGE' }
      }

      const deviceTokenHash = hashToken(deviceToken)
      const existingDeviceLock = await prisma.attendanceDeviceLock.findUnique({
        where: {
          attendanceSessionId_deviceTokenHash: {
            attendanceSessionId,
            deviceTokenHash,
          },
        },
        select: {
          id: true,
        },
      })

      if (existingDeviceLock) {
        return { failure: 'DEVICE_ALREADY_MARKED' }
      }

      return { deviceTokenHash }
    }

    // POST /api/teacher/attendance/symbol/generate
    // Generate a fresh, session-wide symbol challenge for the authenticated teacher.
    router.post('/symbol/generate', requireTeacher, async (req, res) => {
      const parsed = symbolGenerateSchema.safeParse(req.body)

      if (!parsed.success) {
        return fail(res, 400, 'Please provide a valid attendance session.')
      }

      try {
        const symbolChallenge = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id
            FROM "AttendanceSession"
            WHERE id = ${parsed.data.attendanceSessionId}::uuid
            FOR UPDATE
          `

          const session = await tx.attendanceSession.findFirst({
            where: {
              id: parsed.data.attendanceSessionId,
              teacherId: req.teacher.id,
            },
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              attendanceWindowEndsAt: true,
            },
          })

          if (!session || !isSessionOpen(session)) {
            return { failure: 'SESSION_NOT_ACTIVE' }
          }

          const { symbols, correctAnswers } = createSymbolGrid()
          const startedAt = new Date()
          const sessionDeadline = getSessionDeadline(session)
          const expiresAt = new Date(
            Math.min(
              startedAt.getTime() + SYMBOL_CHALLENGE_LIFETIME_SECONDS * 1000,
              sessionDeadline.getTime(),
            ),
          )

          if (expiresAt <= startedAt) {
            return { failure: 'SESSION_NOT_ACTIVE' }
          }

          const generatedChallenge = await tx.symbolChallenge.upsert({
            where: {
              attendanceSessionId: session.id,
            },
            create: {
              attendanceSessionId: session.id,
              symbols,
              correctAnswers,
              startedAt,
              expiresAt,
            },
            update: {
              symbols,
              correctAnswers,
              startedAt,
              expiresAt,
            },
            select: {
              id: true,
              symbols: true,
              correctAnswers: true,
              startedAt: true,
              expiresAt: true,
            },
          })

          // Accepted attempts are intentionally preserved across regeneration.
          // Students who already passed the previous sequence may still submit attendance.

          return { symbolChallenge: generatedChallenge }
        })

        if (symbolChallenge.failure === 'SESSION_NOT_ACTIVE') {
          return fail(res, 409, 'This attendance session is not active.')
        }

        const generatedChallenge = symbolChallenge.symbolChallenge

        return res.status(201).json({
          success: true,
          message: 'A new symbol challenge has been generated.',
          symbolChallenge: {
            id: generatedChallenge.id,
            symbols: generatedChallenge.symbols,
            correctAnswers: generatedChallenge.correctAnswers,
            startedAt: generatedChallenge.startedAt.toISOString(),
            expiresAt: generatedChallenge.expiresAt.toISOString(),
          },
        })
      } catch (error) {
        console.error('Symbol challenge generation failed:', error.message)
        return fail(res, 500, 'The symbol challenge could not be generated.')
      }
    })

    // POST /api/teacher/attendance/symbol/challenge
    // Return only the public symbol grid after QR/text verification.
    router.post(
      '/symbol/challenge',
      (req, res, next) => {
        req.attendanceRequestReceivedAt = new Date()
        next()
      },
      attendanceLimiter,
      attendanceIpLimiter,
      async (req, res) => {
      const parsed = symbolChallengeSchema.safeParse(req.body)

      if (!parsed.success) {
        return fail(res, 400, 'Please verify the current QR code or text code again.')
      }

      const data = parsed.data
      const requestReceivedAt = req.attendanceRequestReceivedAt

      try {
        const access = await validateSymbolAccess({
          ...data,
          requestReceivedAt,
        })

        if (access.failure === 'INVALID_ATTENDANCE_CHALLENGE') {
          return fail(res, 409, 'Your QR/text verification expired. Scan the current code again.')
        }

        if (access.failure === 'DEVICE_ALREADY_MARKED') {
          return fail(res, 409, 'Attendance is already locked for this device in this session.')
        }

        const session = await getSession(data.attendanceSessionId)

        if (!session || !isSessionAcceptingRequest(session, requestReceivedAt)) {
          return fail(res, 409, 'This attendance session has ended or is not open.')
        }

        const campusVerification = await validateCampusGeofence({
          attendanceSessionId: session.id,
          normalizedUniversityRollNumber: normalizeRollNumber(data.universityRollNumber),
          latitude: data.latitude,
          longitude: data.longitude,
          locationAccuracyMeters: data.locationAccuracyMeters,
          locationCapturedAt: data.locationCapturedAt,
          requestReceivedAt,
        })

        if (!campusVerification.success) {
          return fail(
            res,
            campusVerification.status,
            campusVerification.message
          )
        }

        const challengeState = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id
            FROM "AttendanceSession"
            WHERE id = ${session.id}::uuid
            FOR SHARE
          `

          const currentSession = await tx.attendanceSession.findUnique({
            where: { id: session.id },
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              attendanceWindowEndsAt: true,
              closedAt: true,
            },
          })

          if (!currentSession || !isSessionAcceptingRequest(currentSession, requestReceivedAt)) {
            return { failure: 'SESSION_CLOSED' }
          }

          const sessionDeadline = getSessionDeadline(currentSession)
          const extendedChallenge = await tx.attendanceChallenge.updateMany({
            where: {
              attendanceSessionId: session.id,
              tokenHash: hashToken(data.challengeToken),
              consumedAt: null,
              expiresAt: { gt: requestReceivedAt },
            },
            data: { expiresAt: sessionDeadline },
          })

          if (extendedChallenge.count !== 1) {
            return { failure: 'INVALID_ATTENDANCE_CHALLENGE' }
          }

          const symbolChallenge = await tx.symbolChallenge.findUnique({
            where: { attendanceSessionId: session.id },
            select: {
              id: true,
              symbols: true,
              startedAt: true,
              expiresAt: true,
            },
          })

          if (!symbolChallenge || requestReceivedAt >= symbolChallenge.expiresAt) {
            return { waiting: true }
          }

          await tx.symbolChallengeAttempt.upsert({
            where: {
              symbolChallengeId_deviceTokenHash: {
                symbolChallengeId: symbolChallenge.id,
                deviceTokenHash: access.deviceTokenHash,
              },
            },
            create: {
              symbolChallengeId: symbolChallenge.id,
              deviceTokenHash: access.deviceTokenHash,
              normalizedUniversityRollNumber: normalizeRollNumber(data.universityRollNumber),
              expiresAt: symbolChallenge.expiresAt,
            },
            update: { expiresAt: symbolChallenge.expiresAt },
          })

          return { symbolChallenge }
        })

        if (challengeState.failure === 'SESSION_CLOSED') {
          return fail(res, 409, 'This attendance session has ended or is not open.')
        }

        if (challengeState.failure === 'INVALID_ATTENDANCE_CHALLENGE') {
          return fail(res, 409, 'Your QR/text verification expired. Scan the current code again.')
        }

        if (challengeState.waiting) {
          return res.status(202).json({
            success: true,
            waiting: true,
            message: 'Waiting for your teacher to generate the symbol challenge.',
          })
        }

        const symbolChallenge = challengeState.symbolChallenge

        return res.json({
          success: true,
          symbolChallenge: {
            id: symbolChallenge.id,
            symbols: symbolChallenge.symbols,
            startedAt: symbolChallenge.startedAt.toISOString(),
            expiresAt: symbolChallenge.expiresAt.toISOString(),
            serverTime: requestReceivedAt.toISOString(),
          },
        })
      } catch (error) {
        console.error('Symbol challenge fetch failed:', error.message)
        return fail(res, 500, 'The symbol challenge could not be loaded.')
      }
    })

    // POST /api/attendance/symbol/current
    // Lightweight polling endpoint: returns the current public grid once the teacher generates it.
    router.post(
      '/symbol/current',
      (req, res, next) => {
        req.attendanceRequestReceivedAt = new Date()
        next()
      },
      attendanceLimiter,
      attendanceIpLimiter,
      async (req, res) => {
        const parsed = symbolAccessSchema.safeParse(req.body)
        if (!parsed.success) return fail(res, 400, 'Please verify the current QR/text code again.')

        const data = parsed.data
        const requestReceivedAt = req.attendanceRequestReceivedAt

        try {
          const access = await validateSymbolAccess({ ...data, requestReceivedAt })
          if (access.failure === 'INVALID_ATTENDANCE_CHALLENGE') {
            return fail(res, 409, 'Your QR/text verification expired. Scan the current code again.')
          }
          if (access.failure === 'DEVICE_ALREADY_MARKED') {
            return fail(res, 409, 'Attendance is already locked for this device in this session.')
          }

          const session = await getSession(data.attendanceSessionId)
          if (!session || !isSessionAcceptingRequest(session, requestReceivedAt)) {
            return fail(res, 409, 'This attendance session has ended or is not open.')
          }

          const challengeState = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
              SELECT id
              FROM "AttendanceSession"
              WHERE id = ${session.id}::uuid
              FOR SHARE
            `

            const currentSession = await tx.attendanceSession.findUnique({
              where: { id: session.id },
              select: {
                id: true,
                status: true,
                startsAt: true,
                endsAt: true,
                attendanceWindowEndsAt: true,
                closedAt: true,
              },
            })

            if (!currentSession || !isSessionAcceptingRequest(currentSession, requestReceivedAt)) {
              return { failure: 'SESSION_CLOSED' }
            }

            const symbolChallenge = await tx.symbolChallenge.findUnique({
              where: { attendanceSessionId: session.id },
              select: { id: true, symbols: true, startedAt: true, expiresAt: true },
            })

            if (!symbolChallenge || requestReceivedAt >= symbolChallenge.expiresAt) {
              return { waiting: true }
            }

            await tx.symbolChallengeAttempt.upsert({
              where: {
                symbolChallengeId_deviceTokenHash: {
                  symbolChallengeId: symbolChallenge.id,
                  deviceTokenHash: access.deviceTokenHash,
                },
              },
              create: {
                symbolChallengeId: symbolChallenge.id,
                deviceTokenHash: access.deviceTokenHash,
                normalizedUniversityRollNumber: normalizeRollNumber(data.universityRollNumber),
                expiresAt: symbolChallenge.expiresAt,
              },
              update: { expiresAt: symbolChallenge.expiresAt },
            })

            return { symbolChallenge }
          })

          if (challengeState.failure === 'SESSION_CLOSED') {
            return fail(res, 409, 'This attendance session has ended or is not open.')
          }

          if (challengeState.waiting) {
            return res.status(202).json({ success: true, waiting: true, message: 'Waiting for your teacher to generate the symbol challenge.' })
          }

          const symbolChallenge = challengeState.symbolChallenge

          return res.json({
            success: true,
            waiting: false,
            symbolChallenge: {
              id: symbolChallenge.id,
              symbols: symbolChallenge.symbols,
              startedAt: symbolChallenge.startedAt.toISOString(),
              expiresAt: symbolChallenge.expiresAt.toISOString(),
              serverTime: requestReceivedAt.toISOString(),
            },
          })
        } catch (error) {
          console.error('Current symbol challenge polling failed:', error.message)
          return fail(res, 500, 'The current symbol challenge could not be loaded.')
        }
      },
    )

    // POST /api/teacher/attendance/symbol/violation
    // Persist fullscreen-exit and tab-switch violations for this device and session.
    router.post(
      '/symbol/violation',
      (req, res, next) => {
        req.attendanceRequestReceivedAt = new Date()
        next()
      },
      attendanceLimiter,
      attendanceIpLimiter,
      async (req, res) => {
        const parsed = symbolViolationSchema.safeParse(req.body)

        if (!parsed.success) {
          return fail(res, 400, 'The attendance security event is invalid.')
        }

        const data = parsed.data
        const requestReceivedAt = req.attendanceRequestReceivedAt
        const normalizedUniversityRollNumber = normalizeRollNumber(data.universityRollNumber)
        const deviceTokenHash = hashToken(data.deviceToken)

        try {
          const access = await validateSymbolAccess({
            ...data,
            requestReceivedAt,
          })

          if (access.failure === 'INVALID_ATTENDANCE_CHALLENGE') {
            return fail(res, 409, 'Your QR/text verification expired. Scan the current code again.')
          }

          if (access.failure === 'DEVICE_ALREADY_MARKED') {
            return fail(res, 423, 'This device is locked for this attendance session.')
          }

          const result = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
              SELECT id
              FROM "AttendanceSession"
              WHERE id = ${data.attendanceSessionId}::uuid
              FOR UPDATE
            `

            const session = await tx.attendanceSession.findUnique({
              where: { id: data.attendanceSessionId },
              select: {
                id: true,
                status: true,
                startsAt: true,
                endsAt: true,
                attendanceWindowEndsAt: true,
                closedAt: true,
              },
            })

            if (!session || !isSessionAcceptingRequest(session, requestReceivedAt)) {
              return { failure: 'SESSION_CLOSED' }
            }

            const deviceLock = await tx.attendanceDeviceLock.findUnique({
              where: {
                attendanceSessionId_deviceTokenHash: {
                  attendanceSessionId: data.attendanceSessionId,
                  deviceTokenHash,
                },
              },
              select: { id: true },
            })

            if (deviceLock) {
              return { failure: 'DEVICE_LOCKED' }
            }

            const symbolChallenge = await tx.symbolChallenge.findUnique({
              where: { attendanceSessionId: data.attendanceSessionId },
              select: { id: true, expiresAt: true },
            })

            const violationDeadline = symbolChallenge
              ? symbolChallenge.expiresAt.getTime() + SYMBOL_VERIFY_NETWORK_GRACE_MS
              : 0

            if (!symbolChallenge || requestReceivedAt.getTime() > violationDeadline) {
              return { failure: 'SYMBOL_CHALLENGE_EXPIRED' }
            }

            const attempt = await tx.symbolChallengeAttempt.findUnique({
              where: {
                symbolChallengeId_deviceTokenHash: {
                  symbolChallengeId: symbolChallenge.id,
                  deviceTokenHash,
                },
              },
              select: {
                id: true,
                normalizedUniversityRollNumber: true,
              },
            })

            if (!attempt || attempt.normalizedUniversityRollNumber !== normalizedUniversityRollNumber) {
              return { failure: 'SYMBOL_ATTEMPT_NOT_FOUND' }
            }

            const incident = await tx.symbolChallengeViolationEvent.createMany({
              data: [{
                attendanceSessionId: data.attendanceSessionId,
                deviceTokenHash,
                incidentId: data.incidentId,
              }],
              skipDuplicates: true,
            })

            if (incident.count === 0) {
              const existingViolation = await tx.symbolChallengeViolation.findUnique({
                where: {
                  attendanceSessionId_deviceTokenHash: {
                    attendanceSessionId: data.attendanceSessionId,
                    deviceTokenHash,
                  },
                },
                select: { violationCount: true, lockedAt: true },
              })

              return {
                locked: Boolean(existingViolation?.lockedAt),
                violationCount: existingViolation?.violationCount || 0,
                duplicate: true,
              }
            }

            const violation = await tx.symbolChallengeViolation.upsert({
              where: {
                attendanceSessionId_deviceTokenHash: {
                  attendanceSessionId: data.attendanceSessionId,
                  deviceTokenHash,
                },
              },
              create: {
                attendanceSessionId: data.attendanceSessionId,
                deviceTokenHash,
                normalizedUniversityRollNumber,
                violationCount: 1,
                lastViolationAt: requestReceivedAt,
              },
              update: {
                violationCount: { increment: 1 },
                normalizedUniversityRollNumber,
                lastViolationAt: requestReceivedAt,
              },
              select: {
                violationCount: true,
                lockedAt: true,
              },
            })

            if (violation.lockedAt || violation.violationCount >= MAX_SYMBOL_SECURITY_VIOLATIONS) {
              await tx.symbolChallengeViolation.update({
                where: {
                  attendanceSessionId_deviceTokenHash: {
                    attendanceSessionId: data.attendanceSessionId,
                    deviceTokenHash,
                  },
                },
                data: { lockedAt: violation.lockedAt || requestReceivedAt },
              })

              await tx.attendanceDeviceLock.upsert({
                where: {
                  attendanceSessionId_deviceTokenHash: {
                    attendanceSessionId: data.attendanceSessionId,
                    deviceTokenHash,
                  },
                },
                create: {
                  attendanceSessionId: data.attendanceSessionId,
                  deviceTokenHash,
                },
                update: {},
              })

              return {
                locked: true,
                violationCount: violation.violationCount,
              }
            }

            return {
              locked: false,
              violationCount: violation.violationCount,
            }
          })

          if (result.failure === 'SESSION_CLOSED') {
            return fail(res, 409, 'This attendance session has ended or is not open.')
          }

          if (result.failure === 'DEVICE_LOCKED') {
            return fail(res, 423, 'This device is locked for this attendance session.')
          }

          if (result.failure === 'SYMBOL_CHALLENGE_EXPIRED') {
            return fail(res, 409, 'The symbol challenge has expired.')
          }

          if (result.failure === 'SYMBOL_ATTEMPT_NOT_FOUND') {
            return fail(res, 409, 'The symbol verification attempt could not be found. Please restart verification.')
          }

          if (result.locked) {
            return res.status(423).json({
              success: false,
              locked: true,
              violationCount: result.violationCount,
              message: 'A second security violation was detected. This device is locked for this attendance session.',
            })
          }

          return res.json({
            success: true,
            locked: false,
            violationCount: result.violationCount,
            warning: true,
            message: 'Warning: Stay on the attendance verification screen. One more security violation will lock this device for this session.',
          })
        } catch (error) {
          console.error('Symbol security violation recording failed:', error.message)
          return fail(res, 500, 'The attendance security event could not be recorded.')
        }
      }
    )

    // POST /api/teacher/attendance/symbol/verify
    // Verify the three selected symbols; the correct sequence is never sent to students.
    router.post(
      '/symbol/verify',
      (req, res, next) => {
        req.attendanceRequestReceivedAt = new Date()
        next()
      },
      attendanceLimiter,
      attendanceIpLimiter,
      async (req, res) => {
      const parsed = symbolVerifySchema.safeParse(req.body)

      if (!parsed.success) {
        return fail(res, 400, 'Please select one symbol from each row.')
      }

      const data = parsed.data
      const requestReceivedAt = req.attendanceRequestReceivedAt
      const normalizedUniversityRollNumber = normalizeRollNumber(data.universityRollNumber)

      try {
        const access = await validateSymbolAccess({
          ...data,
          requestReceivedAt,
        })

        if (access.failure === 'INVALID_ATTENDANCE_CHALLENGE') {
          return fail(res, 409, 'Your QR/text verification expired. Scan the current code again.')
        }

        if (access.failure === 'DEVICE_ALREADY_MARKED') {
          return fail(res, 409, 'Attendance is already locked for this device in this session.')
        }

        const verificationResult = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id
            FROM "AttendanceSession"
            WHERE id = ${data.attendanceSessionId}::uuid
            FOR SHARE
          `

          const session = await tx.attendanceSession.findUnique({
            where: { id: data.attendanceSessionId },
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              attendanceWindowEndsAt: true,
              closedAt: true,
            },
          })

          if (!session || !isSessionAcceptingRequest(session, requestReceivedAt)) {
            return { failure: 'SESSION_CLOSED' }
          }

          const deviceLock = await tx.attendanceDeviceLock.findUnique({
            where: {
              attendanceSessionId_deviceTokenHash: {
                attendanceSessionId: data.attendanceSessionId,
                deviceTokenHash: access.deviceTokenHash,
              },
            },
            select: { id: true },
          })

          if (deviceLock) return { failure: 'DEVICE_ALREADY_MARKED' }

          const symbolChallenge = await tx.symbolChallenge.findUnique({
            where: { attendanceSessionId: session.id },
            select: {
              id: true,
              correctAnswers: true,
              expiresAt: true,
            },
          })

          if (!symbolChallenge) return { failure: 'SYMBOL_CHALLENGE_EXPIRED' }

          const attemptReference = await tx.symbolChallengeAttempt.findUnique({
            where: {
              symbolChallengeId_deviceTokenHash: {
                symbolChallengeId: symbolChallenge.id,
                deviceTokenHash: access.deviceTokenHash,
              },
            },
            select: {
              id: true,
              normalizedUniversityRollNumber: true,
            },
          })

          if (
            !attemptReference ||
            attemptReference.normalizedUniversityRollNumber !== normalizedUniversityRollNumber
          ) {
            return { failure: 'SYMBOL_ATTEMPT_NOT_FOUND' }
          }

          await tx.$queryRaw`
            SELECT id
            FROM "SymbolChallengeAttempt"
            WHERE id = ${attemptReference.id}::uuid
            FOR UPDATE
          `

          const attempt = await tx.symbolChallengeAttempt.findUnique({
            where: { id: attemptReference.id },
            select: {
              id: true,
              normalizedUniversityRollNumber: true,
              wrongAttempts: true,
              status: true,
            },
          })

          if (
            !attempt ||
            attempt.normalizedUniversityRollNumber !== normalizedUniversityRollNumber
          ) {
            return { failure: 'SYMBOL_ATTEMPT_NOT_FOUND' }
          }

          if (
            attempt.status === 'LOCKED' ||
            attempt.wrongAttempts >= MAX_SYMBOL_WRONG_ATTEMPTS
          ) {
            return { failure: 'SYMBOL_LOCKED' }
          }

          if (attempt.status === 'ACCEPTED') {
            return { accepted: true, alreadyAccepted: true }
          }

          const symbolVerificationDeadline =
            symbolChallenge.expiresAt.getTime() + SYMBOL_VERIFY_NETWORK_GRACE_MS

          if (requestReceivedAt.getTime() > symbolVerificationDeadline) {
            return { failure: 'SYMBOL_CHALLENGE_EXPIRED' }
          }

          const correctAnswers = Array.isArray(symbolChallenge.correctAnswers)
            ? symbolChallenge.correctAnswers
            : []

          const isCorrect =
            correctAnswers.length === 3 &&
            data.answers.every((answer, index) => answer === correctAnswers[index])

          if (!isCorrect) {
            const nextWrongAttempts = attempt.wrongAttempts + 1

            await tx.symbolChallengeAttempt.update({
              where: { id: attempt.id },
              data: {
                wrongAttempts: { increment: 1 },
                status: nextWrongAttempts >= MAX_SYMBOL_WRONG_ATTEMPTS ? 'LOCKED' : 'PENDING',
              },
            })

            if (nextWrongAttempts >= MAX_SYMBOL_WRONG_ATTEMPTS) {
              await tx.attendanceDeviceLock.upsert({
                where: {
                  attendanceSessionId_deviceTokenHash: {
                    attendanceSessionId: data.attendanceSessionId,
                    deviceTokenHash: access.deviceTokenHash,
                  },
                },
                create: {
                  attendanceSessionId: data.attendanceSessionId,
                  deviceTokenHash: access.deviceTokenHash,
                },
                update: {},
              })

              return { failure: 'SYMBOL_LOCKED' }
            }

            return {
              failure: 'SYMBOL_INCORRECT',
              attemptsRemaining: MAX_SYMBOL_WRONG_ATTEMPTS - nextWrongAttempts,
            }
          }

          await tx.symbolChallengeAttempt.update({
            where: { id: attempt.id },
            data: {
              status: 'ACCEPTED',
              acceptedAt: requestReceivedAt,
            },
          })

          return { accepted: true, alreadyAccepted: false }
        })

        if (verificationResult.failure === 'SESSION_CLOSED') {
          return fail(res, 409, 'This attendance session has ended or is not open.')
        }

        if (verificationResult.failure === 'DEVICE_ALREADY_MARKED') {
          return fail(res, 409, 'Attendance is already locked for this device in this session.')
        }

        if (verificationResult.failure === 'SYMBOL_ATTEMPT_NOT_FOUND') {
          return fail(res, 409, 'Please reload the symbol challenge and verify your details again.')
        }

        if (verificationResult.failure === 'SYMBOL_LOCKED') {
          return fail(res, 423, 'Three incorrect attempts. This device is locked for this attendance session.')
        }

        if (verificationResult.failure === 'SYMBOL_CHALLENGE_EXPIRED') {
          return fail(res, 409, 'The symbol challenge has expired. Ask your teacher to generate a new one.')
        }

        if (verificationResult.failure === 'SYMBOL_INCORRECT') {
          return res.status(400).json({
            success: false,
            message: 'The selected symbol sequence is incorrect.',
            attemptsRemaining: verificationResult.attemptsRemaining,
          })
        }

        return res.json({
          success: true,
          message: verificationResult.alreadyAccepted
            ? 'Symbol verification has already been completed.'
            : 'Symbol verification successful. You can now submit your attendance.',
        })
      } catch (error) {
        console.error('Symbol challenge verification failed:', error.message)
        return fail(res, 500, 'Symbol verification could not be completed.')
      }
      }
    )

    // POST /api/teacher/attendance/challenge
    //
    // The student must present a currently valid QR token or text code.
    // The server issues a session-bound challenge; scanning alone does
    // not mark attendance.
    router.post(
      '/challenge',
      attendanceLimiter,
      attendanceIpLimiter,
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

          const challengeExpiresAt = deadline

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

            const finalExpiry = finalDeadline

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
      (req, res, next) => {
        req.attendanceRequestReceivedAt = new Date()
        next()
      },
      attendanceLimiter,
      attendanceIpLimiter,
      async (req, res) => {
        const requestReceivedAt = req.attendanceRequestReceivedAt
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

          const existingSuccessfulAttendance = await findSuccessfulAttendanceRetry(
            prisma,
            {
              attendanceSessionId: session.id,
              deviceToken: data.deviceToken,
              normalizedUniversityRollNumber,
            }
          )

          if (existingSuccessfulAttendance?.attendanceRecord) {
            return res.status(200).json({
              success: true,
              message: 'Attendance marked successfully.',
              attendance: existingSuccessfulAttendance.attendanceRecord,
            })
          }

          const now = requestReceivedAt

          if (!isSessionAcceptingRequest(session, now)) {
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

          const activeGeofenceZones = await prisma.geofenceZone.findMany({
            where: {
              isActive: true,
            },
            select: {
              id: true,
              latitude: true,
              longitude: true,
              radiusMeters: true,
            },
          })

          if (activeGeofenceZones.length === 0) {
            await logAttempt({
              attendanceSessionId: session.id,
              normalizedUniversityRollNumber,
              outcome: 'SUSPICIOUS',
              latitude: data.latitude,
              longitude: data.longitude,
              locationAccuracyMeters: data.locationAccuracyMeters,
              riskFlags: ['NO_ACTIVE_GEOFENCE_ZONES'],
            })

            return fail(
              res,
              503,
              'Campus location verification is currently unavailable. Please contact the administrator.'
            )
          }

          let distanceMeters = Infinity
          let closestConservativeDistanceMeters = Infinity
          let isInsideActiveGeofence = false

          for (const zone of activeGeofenceZones) {
            const zoneDistanceMeters = calculateDistanceMeters(
              zone.latitude,
              zone.longitude,
              data.latitude,
              data.longitude
            )

            const zoneConservativeDistanceMeters =
              zoneDistanceMeters + data.locationAccuracyMeters

            if (zoneConservativeDistanceMeters < closestConservativeDistanceMeters) {
              closestConservativeDistanceMeters = zoneConservativeDistanceMeters
              distanceMeters = zoneDistanceMeters
            }

            if (
              isWithinRadius(
                zoneConservativeDistanceMeters,
                zone.radiusMeters
              )
            ) {
              isInsideActiveGeofence = true
            }
          }

          if (!isInsideActiveGeofence) {
            await logAttempt({
              attendanceSessionId: session.id,
              normalizedUniversityRollNumber,
              outcome: 'OUTSIDE_RADIUS',
              latitude: data.latitude,
              longitude: data.longitude,
              locationAccuracyMeters: data.locationAccuracyMeters,
              distanceMeters: closestConservativeDistanceMeters,
            })

            return fail(
              res,
              403,
              'You are outside the permitted campus attendance area.'
            )
          }

          const result = await prisma.$transaction(async (tx) => {
            const transactionNow = requestReceivedAt

            // Allow concurrent submissions while preventing session closure
            // from racing with an attendance request already in progress.
            await tx.$queryRaw`
              SELECT id
              FROM "AttendanceSession"
              WHERE id = ${session.id}::uuid
              FOR SHARE
            `

            const existingSuccessfulAttendance = await findSuccessfulAttendanceRetry(
              tx,
              {
                attendanceSessionId: session.id,
                deviceToken: data.deviceToken,
                normalizedUniversityRollNumber,
              }
            )

            if (existingSuccessfulAttendance?.attendanceRecord) {
              return {
                record: existingSuccessfulAttendance.attendanceRecord,
              }
            }

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
                  closedAt: true,
                },
              })

            if (
              !currentSession ||
              !isSessionAcceptingRequest(currentSession, transactionNow)
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

            const acceptedSymbolAttempt = await tx.symbolChallengeAttempt.findFirst({
              where: {
                symbolChallenge: {
                  attendanceSessionId: session.id,
                },
                deviceTokenHash: hashToken(data.deviceToken),
                normalizedUniversityRollNumber,
                status: 'ACCEPTED',
                attendanceRecordId: null,
              },
              select: {
                id: true,
              },
            })

            if (!acceptedSymbolAttempt) {
              return {
                failure: 'SYMBOL_VERIFICATION_REQUIRED',
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

            await tx.symbolChallengeAttempt.update({
              where: {
                id: acceptedSymbolAttempt.id,
              },
              data: {
                attendanceRecordId: record.id,
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

          if (result.failure === 'SYMBOL_VERIFICATION_REQUIRED') {
            return fail(
              res,
              403,
              'Complete the symbol challenge successfully before submitting attendance.'
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


    // POST /api/attendance/symbol/submit
    // Verify symbols, recheck the student's fresh campus location, and save attendance atomically.
    router.post(
      '/symbol/submit',
      (req, res, next) => {
        req.attendanceRequestReceivedAt = new Date()
        next()
      },
      attendanceLimiter,
      attendanceIpLimiter,
      async (req, res) => {
        const requestReceivedAt = req.attendanceRequestReceivedAt
        const parsed = symbolAttendanceSchema.safeParse(req.body)

        if (!parsed.success) {
          return fail(res, 400, 'Please provide your details, symbol selections and current location.')
        }

        const data = parsed.data
        const normalizedUniversityRollNumber = normalizeRollNumber(data.universityRollNumber)
        const normalizedSection = normalizeSection(data.section)
        const deviceTokenHash = hashToken(data.deviceToken)

        try {
          const successfulRetry = await findSuccessfulAttendanceRetry(prisma, {
            attendanceSessionId: data.attendanceSessionId,
            deviceToken: data.deviceToken,
            normalizedUniversityRollNumber,
          })

          if (successfulRetry?.attendanceRecord) {
            return res.status(200).json({
              success: true,
              alreadySaved: true,
              message: 'Attendance marked successfully.',
              attendance: successfulRetry.attendanceRecord,
            })
          }

          const access = await validateSymbolAccess({
            ...data,
            requestReceivedAt,
          })

          if (access.failure === 'INVALID_ATTENDANCE_CHALLENGE') {
            return fail(res, 409, 'Your QR/text verification expired. Scan the current code again.')
          }

          if (access.failure === 'DEVICE_ALREADY_MARKED') {
            const prior = await findSuccessfulAttendanceRetry(prisma, {
              attendanceSessionId: data.attendanceSessionId,
              deviceToken: data.deviceToken,
              normalizedUniversityRollNumber,
            })

            if (prior?.attendanceRecord) {
              return res.json({
                success: true,
                alreadySaved: true,
                message: 'Attendance marked successfully.',
                attendance: prior.attendanceRecord,
              })
            }

            return fail(res, 409, 'Attendance is already locked for this device in this session.')
          }

          const session = await getSession(data.attendanceSessionId)

          if (!session || !isSessionAcceptingRequest(session, requestReceivedAt)) {
            return fail(res, 409, 'This attendance session has ended or is not open.')
          }

          const allowedSections = session.sections.map(normalizeSection)
          if (!allowedSections.includes(normalizedSection)) {
            await logAttempt({
              attendanceSessionId: session.id,
              normalizedUniversityRollNumber,
              outcome: 'INVALID_DETAILS',
            })
            return fail(res, 400, 'The selected section is not part of this session.')
          }

          const campusVerification = await validateCampusGeofence({
            attendanceSessionId: session.id,
            normalizedUniversityRollNumber,
            latitude: data.latitude,
            longitude: data.longitude,
            locationAccuracyMeters: data.locationAccuracyMeters,
            locationCapturedAt: data.locationCapturedAt,
            requestReceivedAt,
          })

          if (!campusVerification.success) {
            return fail(res, campusVerification.status, campusVerification.message)
          }

          const result = await prisma.$transaction(async (tx) => {
            // Shared session lock permits concurrent students but serializes against session closure.
            await tx.$queryRaw`
              SELECT id
              FROM "AttendanceSession"
              WHERE id = ${session.id}::uuid
              FOR SHARE
            `

            const currentSession = await tx.attendanceSession.findUnique({
              where: { id: session.id },
              select: {
                id: true,
                teacherId: true,
                sections: true,
                status: true,
                startsAt: true,
                endsAt: true,
                attendanceWindowEndsAt: true,
                closedAt: true,
              },
            })

            if (!currentSession || !isSessionAcceptingRequest(currentSession, requestReceivedAt)) {
              return { failure: 'SESSION_CLOSED' }
            }

            const existing = await findSuccessfulAttendanceRetry(tx, {
              attendanceSessionId: session.id,
              deviceToken: data.deviceToken,
              normalizedUniversityRollNumber,
            })

            if (existing?.attendanceRecord) {
              return { record: existing.attendanceRecord, alreadySaved: true }
            }

            const existingLock = await tx.attendanceDeviceLock.findUnique({
              where: {
                attendanceSessionId_deviceTokenHash: {
                  attendanceSessionId: session.id,
                  deviceTokenHash,
                },
              },
              select: { id: true },
            })

            if (existingLock) return { failure: 'DEVICE_ALREADY_MARKED' }

            const attendanceChallenge = await tx.attendanceChallenge.findFirst({
              where: {
                attendanceSessionId: session.id,
                tokenHash: hashToken(data.challengeToken),
                consumedAt: null,
                expiresAt: { gt: requestReceivedAt },
              },
              select: { id: true },
            })

            if (!attendanceChallenge) return { failure: 'INVALID_CHALLENGE' }

            const symbolChallenge = await tx.symbolChallenge.findUnique({
              where: { attendanceSessionId: session.id },
              select: { id: true, correctAnswers: true, expiresAt: true },
            })

            if (!symbolChallenge) return { failure: 'SYMBOL_CHALLENGE_MISSING' }

            const attempt = await tx.symbolChallengeAttempt.findUnique({
              where: {
                symbolChallengeId_deviceTokenHash: {
                  symbolChallengeId: symbolChallenge.id,
                  deviceTokenHash,
                },
              },
              select: {
                id: true,
                normalizedUniversityRollNumber: true,
                wrongAttempts: true,
                status: true,
                attendanceRecordId: true,
                expiresAt: true,
              },
            })

            if (attempt) {
              await tx.$queryRaw`
                SELECT id
                FROM "SymbolChallengeAttempt"
                WHERE id = ${attempt.id}::uuid
                FOR UPDATE
              `
            }

            const lockedAttempt = attempt
              ? await tx.symbolChallengeAttempt.findUnique({
                  where: { id: attempt.id },
                  select: {
                    id: true,
                    normalizedUniversityRollNumber: true,
                    wrongAttempts: true,
                    status: true,
                    attendanceRecordId: true,
                    expiresAt: true,
                  },
                })
              : null

            if (!lockedAttempt || lockedAttempt.normalizedUniversityRollNumber !== normalizedUniversityRollNumber) {
              return { failure: 'SYMBOL_ATTEMPT_NOT_FOUND' }
            }

            const currentAttempt = lockedAttempt

            if (currentAttempt.attendanceRecordId) {
              return { failure: 'DEVICE_ALREADY_MARKED' }
            }

            if (currentAttempt.status === 'LOCKED' || currentAttempt.wrongAttempts >= MAX_SYMBOL_WRONG_ATTEMPTS) {
              return { failure: 'SYMBOL_LOCKED' }
            }

            // An accepted attempt remains valid even if the teacher regenerated the grid.
            if (currentAttempt.status !== 'ACCEPTED') {
              const symbolDeadline =
                (currentAttempt.expiresAt || symbolChallenge.expiresAt).getTime() + SYMBOL_VERIFY_NETWORK_GRACE_MS

              if (requestReceivedAt.getTime() > symbolDeadline) {
                return { failure: 'SYMBOL_EXPIRED' }
              }

              const correctAnswers = Array.isArray(symbolChallenge.correctAnswers)
                ? symbolChallenge.correctAnswers
                : []

              const isCorrect =
                correctAnswers.length === 3 &&
                data.answers.every((answer, index) => answer === correctAnswers[index])

              if (!isCorrect) {
                const nextWrongAttempts = currentAttempt.wrongAttempts + 1
                await tx.symbolChallengeAttempt.update({
                  where: { id: currentAttempt.id },
                  data: {
                    wrongAttempts: { increment: 1 },
                    status: nextWrongAttempts >= MAX_SYMBOL_WRONG_ATTEMPTS ? 'LOCKED' : 'PENDING',
                  },
                })

                if (nextWrongAttempts >= MAX_SYMBOL_WRONG_ATTEMPTS) {
                  await tx.attendanceDeviceLock.upsert({
                    where: {
                      attendanceSessionId_deviceTokenHash: {
                        attendanceSessionId: session.id,
                        deviceTokenHash,
                      },
                    },
                    create: {
                      attendanceSessionId: session.id,
                      deviceTokenHash,
                    },
                    update: {},
                  })
                  return { failure: 'SYMBOL_LOCKED' }
                }

                return {
                  failure: 'SYMBOL_INCORRECT',
                  attemptsRemaining: MAX_SYMBOL_WRONG_ATTEMPTS - nextWrongAttempts,
                }
              }

              await tx.symbolChallengeAttempt.update({
                where: { id: currentAttempt.id },
                data: { status: 'ACCEPTED', acceptedAt: requestReceivedAt },
              })
            }

            const activeZones = await tx.geofenceZone.findMany({
              where: { isActive: true },
              select: { latitude: true, longitude: true, radiusMeters: true },
            })

            if (activeZones.length === 0) return { failure: 'NO_ACTIVE_GEOFENCE_ZONES' }

            let distanceMeters = Infinity
            let conservativeDistanceMeters = Infinity
            let insideZone = false

            for (const zone of activeZones) {
              const distance = calculateDistanceMeters(
                zone.latitude,
                zone.longitude,
                data.latitude,
                data.longitude,
              )
              const conservativeDistance = distance + data.locationAccuracyMeters

              if (conservativeDistance < conservativeDistanceMeters) {
                conservativeDistanceMeters = conservativeDistance
                distanceMeters = distance
              }

              if (isWithinRadius(conservativeDistance, zone.radiusMeters)) insideZone = true
            }

            if (!insideZone) return { failure: 'OUTSIDE_RADIUS' }

            const consumed = await tx.attendanceChallenge.updateMany({
              where: {
                id: attendanceChallenge.id,
                consumedAt: null,
                expiresAt: { gt: requestReceivedAt },
              },
              data: { consumedAt: requestReceivedAt },
            })

            if (consumed.count !== 1) return { failure: 'INVALID_CHALLENGE' }

            const record = await tx.attendanceRecord.create({
              data: {
                attendanceSessionId: session.id,
                fullName: data.fullName.trim(),
                classRollNumber: data.classRollNumber.trim(),
                universityRollNumber: data.universityRollNumber.trim(),
                normalizedUniversityRollNumber,
                section: normalizedSection,
                latitude: data.latitude,
                longitude: data.longitude,
                locationAccuracyMeters: data.locationAccuracyMeters,
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

            await tx.symbolChallengeAttempt.update({
              where: { id: currentAttempt.id },
              data: {
                status: 'ACCEPTED',
                ...(currentAttempt.status === 'ACCEPTED' ? {} : { acceptedAt: requestReceivedAt }),
                attendanceRecordId: record.id,
              },
            })

            await tx.attendanceDeviceLock.create({
              data: {
                attendanceSessionId: session.id,
                deviceTokenHash,
              },
            })

            await tx.attendanceAttempt.create({
              data: {
                attendanceSessionId: session.id,
                normalizedUniversityRollNumber,
                outcome: 'ACCEPTED',
                latitude: data.latitude,
                longitude: data.longitude,
                locationAccuracyMeters: data.locationAccuracyMeters,
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
                  verification: 'SYMBOL_AND_FRESH_GEOFENCE',
                },
              },
            })

            return { record, savedAt: new Date() }
          })

          if (result.failure === 'SESSION_CLOSED') return fail(res, 409, 'The attendance deadline has passed.')
          if (result.failure === 'DEVICE_ALREADY_MARKED') return fail(res, 409, 'Attendance already marked for this session.')
          if (result.failure === 'INVALID_CHALLENGE') return fail(res, 409, 'Your QR/text verification expired or was already used. Scan the current code again.')
          if (result.failure === 'SYMBOL_CHALLENGE_MISSING') return fail(res, 409, 'The teacher has not generated a symbol challenge yet.')
          if (result.failure === 'SYMBOL_ATTEMPT_NOT_FOUND') return fail(res, 409, 'Please reload the symbol challenge and try again.')
          if (result.failure === 'SYMBOL_LOCKED') return fail(res, 423, 'Three incorrect attempts. This device is locked for this attendance session.')
          if (result.failure === 'SYMBOL_EXPIRED') return fail(res, 409, 'The symbol challenge expired. Ask your teacher to generate a new sequence.')
          if (result.failure === 'SYMBOL_INCORRECT') {
            return res.status(400).json({
              success: false,
              message: 'The selected symbol sequence is incorrect.',
              attemptsRemaining: result.attemptsRemaining,
            })
          }
          if (result.failure === 'NO_ACTIVE_GEOFENCE_ZONES') return fail(res, 503, 'Campus location verification is currently unavailable. Please contact the administrator.')
          if (result.failure === 'OUTSIDE_RADIUS') return fail(res, 403, 'You are outside the permitted campus attendance area.')

          return res.status(result.alreadySaved ? 200 : 201).json({
            success: true,
            alreadySaved: Boolean(result.alreadySaved),
            message: 'Attendance marked successfully.',
            attendance: result.record,
            symbolChallengeExpiresAt: result.symbolChallengeExpiresAt || null,
          })
        } catch (error) {
          if (error?.code === 'P2002') {
            const prior = await findSuccessfulAttendanceRetry(prisma, {
              attendanceSessionId: data.attendanceSessionId,
              deviceToken: data.deviceToken,
              normalizedUniversityRollNumber,
            }).catch(() => null)

            if (prior?.attendanceRecord) {
              return res.json({
                success: true,
                alreadySaved: true,
                message: 'Attendance marked successfully.',
                attendance: prior.attendanceRecord,
              })
            }

            return fail(res, 409, 'Attendance has already been marked for this session.')
          }

          console.error('Atomic symbol attendance submission failed:', error.message)
          return fail(res, 500, 'Attendance could not be submitted right now. Please try again.')
        }
      },
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