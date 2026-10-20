
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from './config/prisma.js'
import cloudinary from './config/cloudinary.js'

const router = Router()

const MAX_FILE_SIZE = 5 * 1024 * 1024
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
})

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload attempts. Try again later.' },
})

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
})

const passwordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8).max(128),
})

const teacherSelect = {
  id: true,
  teacherId: true,
  fullName: true,
  email: true,
  phone: true,
  photoUrl: true,
  status: true,
  mustChangePassword: true,
  highestQualification: true,
  createdAt: true,
  updatedAt: true,
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('INVALID_IMAGE_TYPE'))
    }

    callback(null, true)
  },
})

function hasValidImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
  }

  if (mimeType === 'image/png') {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
  }

  if (mimeType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
  }

  return false
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve()

    req.session.destroy((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function clearTeacherCookie(res) {
  res.clearCookie('attendx.teacher.sid', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  })
}

function uploadToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'attendx/teacher-profiles',
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
      (error, result) => {
        if (error) reject(error)
        else resolve(result)
      },
    )

    stream.end(buffer)
  })
}

async function removeCloudinaryImage(publicId) {
  if (!publicId) return true

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
    })

    return result.result === 'ok' || result.result === 'not found'
  } catch (error) {
    console.error('Old Teacher photo cleanup failed:', error.message)
    return false
  }
}

async function loadTeacherSession(req, res) {
  if (
    req.session?.user?.role !== 'TEACHER' ||
    !req.session.user.id
  ) {
    res.status(401).json({ error: 'Please log in as a Teacher.' })
    return null
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: req.session.user.id },
    select: {
      id: true,
      email: true,
      status: true,
      mustChangePassword: true,
      updatedAt: true,
    },
  })

  const valid =
    teacher &&
    teacher.status === 'ACTIVE' &&
    req.session.teacherSessionVersion === teacher.updatedAt.getTime()

  if (!valid) {
    await destroySession(req)
    clearTeacherCookie(res)
    res.status(401).json({
      error: 'Your session is no longer valid. Please log in again.',
    })
    return null
  }

  return teacher
}

export async function requireTeacherSession(req, res, next) {
  try {
    const teacher = await loadTeacherSession(req, res)
    if (!teacher) return

    req.teacher = teacher
    next()
  } catch (error) {
    next(error)
  }
}

export async function requireTeacher(req, res, next) {
  try {
    const teacher = await loadTeacherSession(req, res)
    if (!teacher) return

    if (teacher.mustChangePassword) {
      return res.status(403).json({
        error: 'Change your password before using Teacher features.',
        mustChangePassword: true,
      })
    }

    req.teacher = teacher
    next()
  } catch (error) {
    next(error)
  }
}

// POST /api/auth/teacher/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Enter a valid email and password.',
      })
    }

    const teacher = await prisma.teacher.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    })

    if (
      !teacher ||
      !(await bcrypt.compare(parsed.data.password, teacher.passwordHash))
    ) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      })
    }

    if (teacher.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Your Teacher account is not active. Contact the Admin.',
      })
    }

    await regenerateSession(req)

    req.session.user = {
      id: teacher.id,
      email: teacher.email,
      role: 'TEACHER',
    }
    req.session.teacherSessionVersion = teacher.updatedAt.getTime()

    await saveSession(req)

    return res.json({
      message: 'Teacher login successful.',
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacherId,
        fullName: teacher.fullName,
        email: teacher.email,
        photoUrl: teacher.photoUrl,
        status: teacher.status,
        mustChangePassword: teacher.mustChangePassword,
      },
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/auth/teacher/me
router.get('/me', requireTeacherSession, async (req, res, next) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.teacher.id },
      select: teacherSelect,
    })

    if (!teacher) {
      await destroySession(req)
      clearTeacherCookie(res)
      return res.status(401).json({ error: 'Teacher account not found.' })
    }

    return res.json({ teacher })
  } catch (error) {
    next(error)
  }
})

// POST /api/auth/teacher/change-password
router.post(
  '/change-password',
  requireTeacherSession,
  async (req, res, next) => {
    try {
      const parsed = passwordSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({
          error: 'New password must contain at least 8 characters.',
        })
      }

      const { currentPassword, newPassword } = parsed.data

      const teacher = await prisma.teacher.findUnique({
        where: { id: req.teacher.id },
      })

      if (!teacher || teacher.status !== 'ACTIVE') {
        return res.status(403).json({
          error: 'Teacher account is not active.',
        })
      }

      if (!teacher.mustChangePassword) {
        if (!currentPassword) {
          return res.status(400).json({
            error: 'Enter your current password.',
          })
        }

        const matches = await bcrypt.compare(
          currentPassword,
          teacher.passwordHash,
        )

        if (!matches) {
          return res.status(400).json({
            error: 'Current password is incorrect.',
          })
        }
      }

      if (await bcrypt.compare(newPassword, teacher.passwordHash)) {
        return res.status(400).json({
          error: 'Choose a different password.',
        })
      }

      const updated = await prisma.teacher.update({
        where: { id: teacher.id },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          mustChangePassword: false,
        },
        select: {
          id: true,
          email: true,
          updatedAt: true,
        },
      })

      await regenerateSession(req)

      req.session.user = {
        id: updated.id,
        email: updated.email,
        role: 'TEACHER',
      }
      req.session.teacherSessionVersion = updated.updatedAt.getTime()

      await saveSession(req)

      return res.json({
        message: 'Password changed successfully.',
        mustChangePassword: false,
      })
    } catch (error) {
      next(error)
    }
  },
)

// POST /api/auth/teacher/profile/photo
router.post(
  '/profile/photo',
  requireTeacher,
  uploadLimiter,
  (req, res, next) => {
    upload.single('photo')(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'Profile photo must be 5 MB or smaller.',
          })
        }

        return res.status(400).json({ error: 'Invalid upload request.' })
      }

      if (error?.message === 'INVALID_IMAGE_TYPE') {
        return res.status(415).json({
          error: 'Only JPEG, PNG and WebP images are allowed.',
        })
      }

      if (error) return next(error)

      next()
    })
  },
  async (req, res, next) => {
    let uploadedPublicId = null

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Select a photo to upload.' })
      }

      if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
        return res.status(415).json({
          error: 'The uploaded file is not a valid supported image.',
        })
      }

      const current = await prisma.teacher.findUnique({
        where: { id: req.teacher.id },
        select: { photoPublicId: true },
      })

      if (!current) {
        return res.status(404).json({ error: 'Teacher account not found.' })
      }

      const result = await uploadToCloudinary(
        req.file.buffer,
        randomUUID(),
      )
      uploadedPublicId = result.public_id

      const updated = await prisma.teacher.update({
        where: { id: req.teacher.id },
        data: {
          photoUrl: result.secure_url,
          photoPublicId: result.public_id,
        },
        select: teacherSelect,
      })

      // Photo update changes updatedAt. Refresh this Teacher's own session
      // version so their session remains valid.
      req.session.teacherSessionVersion = updated.updatedAt.getTime()
      await saveSession(req)

      uploadedPublicId = null

      // The new photo is saved before the previous photo is removed.
      const oldPhotoDeleted = current.photoPublicId
        ? await removeCloudinaryImage(current.photoPublicId)
        : true

      return res.status(200).json({
        message: oldPhotoDeleted
          ? 'Profile photo updated successfully.'
          : 'Photo updated, but the old image could not be confirmed as deleted.',
        teacher: updated,
        oldPhotoDeleted,
      })
    } catch (error) {
      if (uploadedPublicId) {
        await removeCloudinaryImage(uploadedPublicId)
      }

      next(error)
    }
  },
)

// POST /api/auth/teacher/logout
router.post('/logout', async (req, res, next) => {
  try {
    await destroySession(req)
    clearTeacherCookie(res)

    return res.json({ message: 'Logged out successfully.' })
  } catch (error) {
    next(error)
  }
})

export default router
