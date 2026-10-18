
import { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import cloudinary from '../config/cloudinary.js'
import { prisma } from '../config/prisma.js'

const router = Router()

const MAX_FILE_SIZE = 5 * 1024 * 1024

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many upload attempts. Please try again later.',
  },
})

function requireAdmin(req, res, next) {
  const user = req.session?.user

  if (!user || user.role !== 'ADMIN' || !user.id) {
    return res.status(401).json({
      success: false,
      message: 'Please sign in as Admin.',
    })
  }

  req.admin = user
  next()
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('INVALID_IMAGE_TYPE'))
    }

    callback(null, true)
  },
})

function hasValidImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    )
  }

  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
  }

  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
  }

  return false
}

function uploadToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'attendx/admin-profiles',
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
      (error, result) => {
        if (error) {
          return reject(error)
        }

        resolve(result)
      }
    )

    stream.end(buffer)
  })
}

async function removeCloudinaryImage(publicId) {
  if (!publicId) return false

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
    })

    if (result.result !== 'ok' && result.result !== 'not found') {
      console.error(
        'Cloudinary cleanup was not confirmed:',
        publicId,
        result.result
      )
      return false
    }

    return true
  } catch (error) {
    console.error('Cloudinary cleanup failed:', error.message)
    return false
  }
}

// POST /api/admin/uploads/profile-photo
router.post(
  '/profile-photo',
  requireAdmin,
  uploadLimiter,
  (req, res, next) => {
    upload.single('photo')(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              success: false,
              message: 'Profile photo must be 5 MB or smaller.',
            })
          }

          return res.status(400).json({
            success: false,
            message: 'Invalid upload request.',
          })
        }

        if (error.message === 'INVALID_IMAGE_TYPE') {
          return res.status(415).json({
            success: false,
            message: 'Only JPEG, PNG and WebP images are allowed.',
          })
        }

        return next(error)
      }

      next()
    })
  },
  async (req, res) => {
    let uploadedPublicId = null

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please select a profile photo.',
        })
      }

      if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
        return res.status(415).json({
          success: false,
          message: 'The uploaded file is not a valid supported image.',
        })
      }

      // Find the Admin and remember the previous photo.
      const existingAdmin = await prisma.admin.findUnique({
        where: {
          id: req.admin.id,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          photoUrl: true,
          photoPublicId: true,
        },
      })

      if (!existingAdmin) {
        return res.status(404).json({
          success: false,
          message: 'Admin account was not found.',
        })
      }

      const oldPhotoPublicId = existingAdmin.photoPublicId

      // Upload the new image first.
      const newPublicId = randomUUID()

      const result = await uploadToCloudinary(
        req.file.buffer,
        newPublicId
      )

      uploadedPublicId = result.public_id

      // Save the new photo in the database.
      const updatedAdmin = await prisma.admin.update({
        where: {
          id: existingAdmin.id,
        },
        data: {
          photoUrl: result.secure_url,
          photoPublicId: result.public_id,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          photoUrl: true,
          photoPublicId: true,
        },
      })

      // Database save succeeded. The new image is now the active photo.
      uploadedPublicId = null

      // Only now attempt to remove the previous Cloudinary image.
      let oldPhotoDeleted = true

      if (
        oldPhotoPublicId &&
        oldPhotoPublicId !== updatedAdmin.photoPublicId
      ) {
        oldPhotoDeleted = await removeCloudinaryImage(
          oldPhotoPublicId
        )
      }

      return res.status(201).json({
        success: true,
        message: oldPhotoDeleted
          ? 'Profile photo uploaded and saved successfully.'
          : 'New profile photo saved. The previous image could not be confirmed as deleted.',
        admin: {
          id: updatedAdmin.id,
          name: updatedAdmin.fullName,
          email: updatedAdmin.email,
          photoUrl: updatedAdmin.photoUrl,
        },
        photo: {
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
        },
        oldPhotoDeleted,
      })
    } catch (error) {
      console.error(
        'Admin profile photo upload/save failed:',
        error.message
      )

      // If saving the new image failed, clean up the new upload.
      // Never delete the previous image in this failure path.
      if (uploadedPublicId) {
        await removeCloudinaryImage(uploadedPublicId)
      }

      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'Admin account was not found.',
        })
      }

      return res.status(500).json({
        success: false,
        message: 'Profile photo could not be saved. Please try again.',
      })
    }
  }
)

export default router
