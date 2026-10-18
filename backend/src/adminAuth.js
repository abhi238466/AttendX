import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { prisma } from './config/prisma.js'
import { sendOtpEmail } from './services/emailService.js'

const router = Router()

const OTP_EXPIRY_MS = 5 * 60 * 1000
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

// Login lockout is kept in this process's memory.
// For multiple backend instances or lockout that must survive restarts,
// use a shared store (for example, PostgreSQL or Redis).
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000
const loginAttempts = new Map()

function getLoginAttemptKey(req) {
  // Lock by client IP, not email, so changing the email cannot bypass lockout.
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function getActiveLoginLock(key, now = Date.now()) {
  const record = loginAttempts.get(key)

  if (!record) return null

  if (record.lockedUntil && record.lockedUntil > now) {
    return record.lockedUntil
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    loginAttempts.delete(key)
    return null
  }

  return null
}

function recordFailedLogin(key, now = Date.now()) {
  // Remove expired lockouts and stale, non-locked records as requests arrive.
  for (const [storedKey, record] of loginAttempts) {
    if (
      (record.lockedUntil && record.lockedUntil <= now) ||
      (!record.lockedUntil && now - record.lastAttemptAt > LOGIN_LOCKOUT_MS)
    ) {
      loginAttempts.delete(storedKey)
    }
  }

  const current = loginAttempts.get(key) || { count: 0, lastAttemptAt: now }
  current.count += 1
  current.lastAttemptAt = now

  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    current.lockedUntil = now + LOGIN_LOCKOUT_MS
  }

  loginAttempts.set(key, current)
  return current
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key)
}

function sendLoginLockedResponse(res, lockedUntil) {
  const remainingSeconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000))
  const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60))

  return res.status(429).json({
    success: false,
    message: `Too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
    retryAfterSeconds: remainingSeconds,
  })
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
})

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
})

const emailSchema = z.object({
  email: z.string().trim().email().max(254),
})

const verifyOtpSchema = z.object({
  email: z.string().trim().email().max(254),
  otp: z.string().regex(/^\d{6}$/),
})

const resetSchema = z.object({
  email: z.string().trim().email().max(254),
  resetToken: z.string().min(32).max(256),
  newPassword: z.string().min(8).max(128),
})

// Keep registration and password-reset limits separate.
const registerOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many registration attempts. Please wait 15 minutes and try again.',
  },
})

const resetOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password-reset attempts. Please wait 15 minutes and try again.',
  },
})

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again later.',
  },
})

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset attempts. Please try again later.',
  },
})

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function getAllowedAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
}

function hashValue(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeHashCompare(a, b) {
  const first = Buffer.from(a, 'hex')
  const second = Buffer.from(b, 'hex')

  return first.length === second.length && timingSafeEqual(first, second)
}

function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

async function createOtpChallenge({
  email,
  purpose,
  pendingFullName,
  pendingPasswordHash,
}) {
  const otp = generateOtp()
  const now = new Date()

  // Invalidate older codes for this email and purpose.
  await prisma.otpChallenge.deleteMany({
    where: {
      email,
      purpose,
      consumedAt: null,
    },
  })

  const challenge = await prisma.otpChallenge.create({
    data: {
      email,
      purpose,
      codeHash: hashValue(otp),
      expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
      pendingFullName,
      pendingPasswordHash,
    },
  })

  try {
    await sendOtpEmail({
      to: email,
      otp,
      purpose:
        purpose === 'ADMIN_REGISTRATION' ? 'registration' : 'password-reset',
    })
  } catch (error) {
    await prisma.otpChallenge.delete({
      where: { id: challenge.id },
    }).catch(() => {})

    throw error
  }

  return challenge
}

async function verifyOtp(challenge, submittedOtp) {
  const now = new Date()

  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= now ||
    challenge.attempts >= MAX_OTP_ATTEMPTS
  ) {
    return false
  }

  const matches = safeHashCompare(
    challenge.codeHash,
    hashValue(submittedOtp)
  )

  if (!matches) {
    const nextAttempts = challenge.attempts + 1

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: nextAttempts,
        ...(nextAttempts >= MAX_OTP_ATTEMPTS
          ? { consumedAt: now }
          : {}),
      },
    })

    return false
  }

  return true
}

// Begin restricted Admin registration.
// The Admin account is NOT created until the OTP is verified.
router.post('/register', registerOtpLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid name, email and password of at least 8 characters.',
      })
    }

    const { name, password } = parsed.data
    const email = normalizeEmail(parsed.data.email)

    if (!getAllowedAdminEmails().includes(email)) {
      return res.status(403).json({
        success: false,
        message: 'This email is not authorized for Admin registration.',
      })
    }

    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: 'An Admin account already exists for this email.',
      })
    }

    const pendingPasswordHash = await bcrypt.hash(password, 12)

    await createOtpChallenge({
      email,
      purpose: 'ADMIN_REGISTRATION',
      pendingFullName: name,
      pendingPasswordHash,
    })

    return res.status(200).json({
      success: true,
      requiresOtp: true,
      message: 'A verification code has been sent if email delivery is available.',
    })
  } catch (error) {
    return next(error)
  }
})

// Verify registration OTP, then create the Admin account.
router.post('/verify-registration-otp', otpVerifyLimiter, async (req, res, next) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email and 6-digit verification code.',
      })
    }

    const email = normalizeEmail(parsed.data.email)

    if (!getAllowedAdminEmails().includes(email)) {
      return res.status(403).json({
        success: false,
        message: 'This email is not authorized for Admin registration.',
      })
    }

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        email,
        purpose: 'ADMIN_REGISTRATION',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!(await verifyOtp(challenge, parsed.data.otp))) {
      return res.status(400).json({
        success: false,
        message: 'The verification code is invalid, expired or already used.',
      })
    }

    if (!challenge.pendingFullName || !challenge.pendingPasswordHash) {
      return res.status(400).json({
        success: false,
        message: 'Registration could not be verified. Please register again.',
      })
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Conditional consumption prevents reusing a verified challenge.
        const consumed = await tx.otpChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            attempts: { lt: MAX_OTP_ATTEMPTS },
          },
          data: { consumedAt: new Date() },
        })

        if (consumed.count !== 1) {
          throw new Error('OTP_ALREADY_USED')
        }

        await tx.admin.create({
          data: {
            fullName: challenge.pendingFullName,
            email,
            passwordHash: challenge.pendingPasswordHash,
          },
        })
      })
    } catch (error) {
      if (error.message === 'OTP_ALREADY_USED') {
        return res.status(400).json({
          success: false,
          message: 'This verification code has expired or was already used.',
        })
      }

      if (error?.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'An Admin account already exists for this email.',
        })
      }

      throw error
    }

    return res.status(201).json({
      success: true,
      message: 'Email verified and Admin account created. You can now sign in.',
    })
  } catch (error) {
    return next(error)
  }
})

// Admin login
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email and password.',
      })
    }

    const email = normalizeEmail(parsed.data.email)
    const loginAttemptKey = getLoginAttemptKey(req)
    const lockedUntil = getActiveLoginLock(loginAttemptKey)

    if (lockedUntil) {
      return sendLoginLockedResponse(res, lockedUntil)
    }

    const admin = await prisma.admin.findUnique({
      where: { email },
    })

    const passwordMatches = admin
      ? await bcrypt.compare(parsed.data.password, admin.passwordHash)
      : false

    if (!admin || !passwordMatches) {
      const attempt = recordFailedLogin(loginAttemptKey)

      if (attempt.lockedUntil) {
        return sendLoginLockedResponse(res, attempt.lockedUntil)
      }

      const attemptsRemaining = MAX_LOGIN_ATTEMPTS - attempt.count

      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${attemptsRemaining} attempt(s) remaining before a 15-minute lockout.`,
      })
    }

    // A valid password clears the failed-login counter for this email and IP.
    clearLoginAttempts(loginAttemptKey)

    if (!req.session) {
      return res.status(500).json({
        success: false,
        message: 'Session service is unavailable.',
      })
    }

    req.session.regenerate((sessionError) => {
      if (sessionError) return next(sessionError)

      req.session.user = {
        id: admin.id,
        email: admin.email,
        role: 'ADMIN',
      }

      req.session.save((saveError) => {
        if (saveError) return next(saveError)

        return res.status(200).json({
          success: true,
          message: 'Login successful.',
          user: {
            id: admin.id,
            name: admin.fullName,
            email: admin.email,
            role: 'ADMIN',
          },
        })
      })
    })
  } catch (error) {
    return next(error)
  }
})

// Start password recovery. Do not reveal whether the email exists.
router.post('/forgot-password', resetOtpLimiter, async (req, res, next) => {
  try {
    const parsed = emailSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address.',
      })
    }

    const email = normalizeEmail(parsed.data.email)

    const admin = await prisma.admin.findUnique({
      where: { email },
      select: { id: true },
    })

    if (admin) {
      await createOtpChallenge({
        email,
        purpose: 'ADMIN_PASSWORD_RESET',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'If the account is eligible, a verification code will be sent.',
    })
  } catch (error) {
    return next(error)
  }
})

// Verify password-reset OTP and issue a short-lived reset token.
router.post('/verify-reset-otp', otpVerifyLimiter, async (req, res, next) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email and 6-digit verification code.',
      })
    }

    const email = normalizeEmail(parsed.data.email)

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        email,
        purpose: 'ADMIN_PASSWORD_RESET',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!(await verifyOtp(challenge, parsed.data.otp))) {
      return res.status(400).json({
        success: false,
        message: 'The verification code is invalid, expired or already used.',
      })
    }

    const resetToken = randomBytes(32).toString('hex')
    const now = new Date()

    const consumed = await prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: MAX_OTP_ATTEMPTS },
      },
      data: {
        consumedAt: now,
        resetTokenHash: hashValue(resetToken),
        resetTokenExpiresAt: new Date(now.getTime() + RESET_TOKEN_EXPIRY_MS),
      },
    })

    if (consumed.count !== 1) {
      return res.status(400).json({
        success: false,
        message: 'This verification code has expired or was already used.',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Email verified. Set your new password.',
      resetToken,
    })
  } catch (error) {
    return next(error)
  }
})

// Reset password using the short-lived token.
router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email, reset token and password of at least 8 characters.',
      })
    }

    const email = normalizeEmail(parsed.data.email)
    const tokenHash = hashValue(parsed.data.resetToken)
    const now = new Date()

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        email,
        purpose: 'ADMIN_PASSWORD_RESET',
        consumedAt: { not: null },
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: { gt: now },
      },
    })

    if (!challenge) {
      return res.status(400).json({
        success: false,
        message: 'The password reset token is invalid or expired. Request a new code.',
      })
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: { gt: new Date() },
        },
        data: {
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
      })

      if (consumed.count !== 1) {
        throw new Error('RESET_TOKEN_ALREADY_USED')
      }

      await tx.admin.update({
        where: { email },
        data: { passwordHash },
      })
    })

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully. Sign in with your new password.',
    })
  } catch (error) {
    if (error.message === 'RESET_TOKEN_ALREADY_USED') {
      return res.status(400).json({
        success: false,
        message: 'The password reset token has already been used. Request a new code.',
      })
    }

    return next(error)
  }
})

const updateAdminProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

const updateAdminProfileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many profile update attempts. Please try again later.',
  },
})

function requireAdminSession(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'ADMIN' || !req.session.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Please sign in as Admin.',
    })
  }

  next()
}

// Get the current Admin profile from the database so photo/name changes
// remain visible after refreshing the dashboard.
router.get('/me', requireAdminSession, async (req, res, next) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.session.user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        photoUrl: true,
      },
    })

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin account was not found. Please sign in again.',
      })
    }

    return res.status(200).json({
      success: true,
      user: {
        id: admin.id,
        name: admin.fullName,
        fullName: admin.fullName,
        email: admin.email,
        role: 'ADMIN',
        photoUrl: admin.photoUrl || '',
      },
    })
  } catch (error) {
    return next(error)
  }
})

// Update the signed-in Admin's display name.
router.patch(
  '/profile',
  requireAdminSession,
  updateAdminProfileLimiter,
  async (req, res, next) => {
    try {
      const parsed = updateAdminProfileSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: 'Admin name must contain between 2 and 120 characters.',
        })
      }

      const admin = await prisma.admin.update({
        where: { id: req.session.user.id },
        data: { fullName: parsed.data.name },
        select: {
          id: true,
          fullName: true,
          email: true,
          photoUrl: true,
        },
      })

      return res.status(200).json({
        success: true,
        message: 'Admin profile updated successfully.',
        user: {
          id: admin.id,
          name: admin.fullName,
          fullName: admin.fullName,
          email: admin.email,
          role: 'ADMIN',
          photoUrl: admin.photoUrl || '',
        },
      })
    } catch (error) {
      if (error?.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'Admin account was not found.',
        })
      }

      return next(error)
    }
  }
)

// Admin logout
router.post('/logout', (req, res, next) => {
  if (!req.session) {
    return res.status(200).json({
      success: true,
      message: 'Logged out.',
    })
  }

  req.session.destroy((error) => {
    if (error) return next(error)

    res.clearCookie('attendx.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    })

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    })
  })
})

export default router