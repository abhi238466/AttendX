
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'

const router = Router()

// Fields returned to the Admin Teacher Management UI.
const teacherSelect = {
  id: true,
  teacherId: true,
  fullName: true,
  photoUrl: true,
  email: true,
  phone: true,
  age: true,
  gender: true,
  highestQualification: true,
  address: true,
  mustChangePassword: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  reviewedByAdminId: true,
  createdAt: true,
  updatedAt: true,
}

// Admin-only authorization.
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

router.use(requireAdmin)

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url')
}

function generateTeacherId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = randomBytes(4).toString('hex').toUpperCase()

  return `TCH-${date}-${suffix}`
}

function isUniqueConstraintError(error) {
  return error?.code === 'P2002'
}

const createTeacherSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(20),
  age: z.coerce.number().int().min(18).max(100),
  gender: z.enum([
    'MALE',
    'FEMALE',
    'OTHER',
    'PREFER_NOT_TO_SAY',
  ]),
  highestQualification: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(500),
})

const updateStatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'ACTIVE',
    'REJECTED',
    'SUSPENDED',
    'DEACTIVATED',
  ]),
})

// GET /api/admin/teachers
// Supports search, status filtering and pagination.
router.get('/', async (req, res, next) => {
  try {
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim().slice(0, 120)
        : ''

    const status =
      typeof req.query.status === 'string'
        ? req.query.status
        : undefined

    const page = Math.max(
      1,
      Math.min(1000000, Number.parseInt(req.query.page, 10) || 1),
    )

    const limit = Math.max(
      1,
      Math.min(100, Number.parseInt(req.query.limit, 10) || 10),
    )

    const validStatuses = [
      'PENDING',
      'ACTIVE',
      'REJECTED',
      'SUSPENDED',
      'DEACTIVATED',
    ]

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher status filter.',
      })
    }

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { teacherId: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [teachers, total] = await prisma.$transaction([
      prisma.teacher.findMany({
        where,
        select: teacherSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.teacher.count({ where }),
    ])

    return res.status(200).json({
      success: true,
      teachers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return next(error)
  }
})

// POST /api/admin/teachers
// Create a teacher account with a temporary password.
router.post('/', async (req, res, next) => {
  try {
    const parsed = createTeacherSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Please enter valid teacher details.',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const data = parsed.data
    const email = normalizeEmail(data.email)
    const phone = data.phone.trim()

    const existing = await prisma.teacher.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
      select: { id: true },
    })

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A teacher with this email or phone already exists.',
      })
    }

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await bcrypt.hash(temporaryPassword, 12)

    let teacher = null

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedTeacherId = generateTeacherId()

      try {
        teacher = await prisma.$transaction(async (tx) => {
          const created = await tx.teacher.create({
            data: {
              teacherId: generatedTeacherId,
              fullName: data.fullName,
              email,
              phone,
              age: data.age,
              gender: data.gender,
              highestQualification: data.highestQualification,
              address: data.address,
              passwordHash,
              mustChangePassword: true,
              status: 'ACTIVE',
            },
            select: teacherSelect,
          })

          await tx.auditLog.create({
            data: {
              actorType: 'ADMIN',
              actorId: req.admin.id,
              action: 'TEACHER_CREATED',
              entityType: 'Teacher',
              entityId: created.id,
              metadata: {
                teacherId: created.teacherId,
                email: created.email,
              },
            },
          })

          return created
        })

        break
      } catch (error) {
        if (
          isUniqueConstraintError(error) &&
          Array.isArray(error.meta?.target) &&
          error.meta.target.includes('teacherId') &&
          attempt < 4
        ) {
          continue
        }

        if (isUniqueConstraintError(error)) {
          return res.status(409).json({
            success: false,
            message: 'This email, phone or Teacher ID already exists.',
          })
        }

        throw error
      }
    }

    if (!teacher) {
      return res.status(500).json({
        success: false,
        message: 'Could not generate a unique Teacher ID. Please retry.',
      })
    }

    return res.status(201).json({
      success: true,
      message: 'Teacher account created successfully.',
      teacher,
      credentials: {
        temporaryPassword,
        mustChangePassword: true,
      },
    })
  } catch (error) {
    return next(error)
  }
})

// PATCH /api/admin/teachers/:id/reset-password
// Invalidate the old password and require a password change at next login.
router.patch('/:id/reset-password', async (req, res, next) => {
  try {
    const idResult = z.string().uuid().safeParse(req.params.id)

    if (!idResult.success) {
      return res.status(400).json({
        success: false,
        message: 'A valid teacher ID is required.',
      })
    }

    const teacherId = idResult.data

    const existing = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        teacherId: true,
        status: true,
      },
    })

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found.',
      })
    }

    if (existing.status !== 'ACTIVE') {
      return res.status(409).json({
        success: false,
        message: 'Only active teachers can have their password reset.',
      })
    }

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await bcrypt.hash(temporaryPassword, 12)
    const resetAt = new Date()

    await prisma.$transaction(async (tx) => {
      await tx.teacher.update({
        where: { id: teacherId },
        data: {
          passwordHash,
          mustChangePassword: true,
          updatedAt: resetAt,
        },
      })

      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: req.admin.id,
          action: 'TEACHER_PASSWORD_RESET',
          entityType: 'Teacher',
          entityId: teacherId,
          metadata: {
            teacherId: existing.teacherId,
            resetAt: resetAt.toISOString(),
            mustChangePassword: true,
          },
        },
      })
    })

    return res.status(200).json({
      success: true,
      message:
        'Password reset successfully. Teacher must set a new password at next login.',
      credentials: {
        temporaryPassword,
        mustChangePassword: true,
      },
    })
  } catch (error) {
    return next(error)
  }
})

// PATCH /api/admin/teachers/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const idResult = z.string().uuid().safeParse(req.params.id)
    const bodyResult = updateStatusSchema.safeParse(req.body)

    if (!idResult.success || !bodyResult.success) {
      return res.status(400).json({
        success: false,
        message: 'A valid teacher ID and status are required.',
      })
    }

    const teacherId = idResult.data
    const status = bodyResult.data.status

    const updatedTeacher = await prisma.$transaction(async (tx) => {
      const existing = await tx.teacher.findUnique({
        where: { id: teacherId },
        select: {
          id: true,
          status: true,
          teacherId: true,
        },
      })

      if (!existing) {
        return null
      }

      const reviewFields = ['REJECTED', 'ACTIVE'].includes(status)
        ? {
            reviewedAt: new Date(),
            reviewedByAdminId: req.admin.id,
          }
        : {}

      const updated = await tx.teacher.update({
        where: { id: teacherId },
        data: {
          status,
          ...reviewFields,
        },
        select: teacherSelect,
      })

      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: req.admin.id,
          action: 'TEACHER_STATUS_UPDATED',
          entityType: 'Teacher',
          entityId: teacherId,
          metadata: {
            teacherId: existing.teacherId,
            previousStatus: existing.status,
            newStatus: status,
          },
        },
      })

      return updated
    })

    if (!updatedTeacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found.',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Teacher status updated successfully.',
      teacher: updatedTeacher,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
