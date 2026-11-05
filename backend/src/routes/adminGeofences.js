import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'

const router = Router()

function requireAdmin(req, res, next) {
  const user = req.session?.user

  if (!user || user.role !== 'ADMIN' || !user.id) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required',
    })
  }

  req.admin = user
  next()
}

router.use(requireAdmin)

const geofenceSchema = z.object({
  areaName: z.string().trim().min(1).max(120),
  zoneName: z.string().trim().min(1).max(120),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().int().min(1).max(1000),
})

const statusSchema = z.object({
  isActive: z.boolean(),
})

router.get('/', async (req, res) => {
  try {
    const zones = await prisma.geofenceZone.findMany({
      orderBy: [
        { areaName: 'asc' },
        { zoneName: 'asc' },
        { createdAt: 'asc' },
      ],
    })

    return res.status(200).json({
      success: true,
      count: zones.length,
      zones,
    })
  } catch (error) {
    console.error('Geofence fetch failed:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Unable to fetch geofence zones',
    })
  }
})

router.post('/', async (req, res) => {
  try {
    const validation = geofenceSchema.safeParse(req.body)

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid geofence details',
        errors: validation.error.flatten().fieldErrors,
      })
    }

    const zone = await prisma.geofenceZone.create({
      data: validation.data,
    })

    return res.status(201).json({
      success: true,
      message: 'Geofence zone created successfully',
      zone,
    })
  } catch (error) {
    console.error('Geofence creation failed:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Unable to create geofence zone',
    })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const idValidation = z.string().uuid().safeParse(req.params.id)

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid geofence ID',
      })
    }

    const validation = geofenceSchema.safeParse(req.body)

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid geofence details',
        errors: validation.error.flatten().fieldErrors,
      })
    }

    const existingZone = await prisma.geofenceZone.findUnique({
      where: { id: req.params.id },
    })

    if (!existingZone) {
      return res.status(404).json({
        success: false,
        message: 'Geofence zone not found',
      })
    }

    const zone = await prisma.geofenceZone.update({
      where: { id: req.params.id },
      data: validation.data,
    })

    return res.status(200).json({
      success: true,
      message: 'Geofence zone updated successfully',
      zone,
    })
  } catch (error) {
    console.error('Geofence update failed:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Unable to update geofence zone',
    })
  }
})

router.patch('/:id/status', async (req, res) => {
  try {
    const idValidation = z.string().uuid().safeParse(req.params.id)

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid geofence ID',
      })
    }

    const validation = statusSchema.safeParse(req.body)

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'A valid isActive value is required',
      })
    }

    const existingZone = await prisma.geofenceZone.findUnique({
      where: { id: req.params.id },
    })

    if (!existingZone) {
      return res.status(404).json({
        success: false,
        message: 'Geofence zone not found',
      })
    }

    const zone = await prisma.geofenceZone.update({
      where: { id: req.params.id },
      data: validation.data,
    })

    return res.status(200).json({
      success: true,
      message: zone.isActive
        ? 'Geofence zone enabled successfully'
        : 'Geofence zone disabled successfully',
      zone,
    })
  } catch (error) {
    console.error('Geofence status update failed:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Unable to update geofence status',
    })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const idValidation = z.string().uuid().safeParse(req.params.id)

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid geofence ID',
      })
    }

    const existingZone = await prisma.geofenceZone.findUnique({
      where: { id: req.params.id },
    })

    if (!existingZone) {
      return res.status(404).json({
        success: false,
        message: 'Geofence zone not found',
      })
    }

    const activeSessions = await prisma.attendanceSession.count({
      where: { status: 'ACTIVE' },
    })

    if (activeSessions > 0) {
      return res.status(409).json({
        success: false,
        message:
          'Geofence zones cannot be permanently deleted while attendance sessions are active. Disable the zone instead.',
      })
    }

    await prisma.geofenceZone.delete({
      where: { id: req.params.id },
    })

    return res.status(200).json({
      success: true,
      message: 'Geofence zone deleted successfully',
    })
  } catch (error) {
    console.error('Geofence deletion failed:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Unable to delete geofence zone',
    })
  }
})

export default router