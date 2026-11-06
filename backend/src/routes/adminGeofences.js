
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireAdminSession } from '../adminAuth.js'

const router = Router()

router.use(requireAdminSession)

const geofenceSchema = z.object({
  areaName: z.string().trim().min(1).max(120),
  zoneName: z.string().trim().min(1).max(120),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().int().min(1).max(1000),
}).strict()

const statusSchema = z.object({
  isActive: z.boolean(),
}).strict()

const idSchema = z.string().uuid()

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  })
}

function getAdminId(req) {
  return req.session.user.id
}

async function writeGeofenceAudit(tx, req, action, zone, metadata = {}) {
  await tx.auditLog.create({
    data: {
      actorType: 'ADMIN',
      actorId: getAdminId(req),
      action,
      entityType: 'GeofenceZone',
      entityId: zone.id,
      metadata: {
        areaName: zone.areaName,
        zoneName: zone.zoneName,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radiusMeters: zone.radiusMeters,
        isActive: zone.isActive,
        ...metadata,
      },
    },
  })
}

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

    return sendError(res, 500, 'Unable to fetch geofence zones.')
  }
})

router.post('/', async (req, res) => {
  const validation = geofenceSchema.safeParse(req.body)

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid geofence details.',
      errors: validation.error.flatten().fieldErrors,
    })
  }

  try {
    const zone = await prisma.$transaction(async (tx) => {
      const createdZone = await tx.geofenceZone.create({
        data: validation.data,
      })

      await writeGeofenceAudit(
        tx,
        req,
        'GEOFENCE_ZONE_CREATED',
        createdZone
      )

      return createdZone
    })

    return res.status(201).json({
      success: true,
      message: 'Geofence zone created successfully.',
      zone,
    })
  } catch (error) {
    console.error('Geofence creation failed:', error.message)

    return sendError(res, 500, 'Unable to create geofence zone.')
  }
})

router.put('/:id', async (req, res) => {
  const idValidation = idSchema.safeParse(req.params.id)

  if (!idValidation.success) {
    return sendError(res, 400, 'Invalid geofence ID.')
  }

  const validation = geofenceSchema.safeParse(req.body)

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid geofence details.',
      errors: validation.error.flatten().fieldErrors,
    })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingZone = await tx.geofenceZone.findUnique({
        where: { id: idValidation.data },
      })

      if (!existingZone) {
        return { notFound: true }
      }

      const zone = await tx.geofenceZone.update({
        where: { id: idValidation.data },
        data: validation.data,
      })

      await writeGeofenceAudit(
        tx,
        req,
        'GEOFENCE_ZONE_UPDATED',
        zone,
        {
          previousValues: {
            areaName: existingZone.areaName,
            zoneName: existingZone.zoneName,
            latitude: existingZone.latitude,
            longitude: existingZone.longitude,
            radiusMeters: existingZone.radiusMeters,
            isActive: existingZone.isActive,
          },
        }
      )

      return { zone }
    })

    if (result.notFound) {
      return sendError(res, 404, 'Geofence zone not found.')
    }

    return res.status(200).json({
      success: true,
      message: 'Geofence zone updated successfully.',
      zone: result.zone,
    })
  } catch (error) {
    console.error('Geofence update failed:', error.message)

    if (error?.code === 'P2025') {
      return sendError(res, 404, 'Geofence zone not found.')
    }

    return sendError(res, 500, 'Unable to update geofence zone.')
  }
})

router.patch('/:id/status', async (req, res) => {
  const idValidation = idSchema.safeParse(req.params.id)

  if (!idValidation.success) {
    return sendError(res, 400, 'Invalid geofence ID.')
  }

  const validation = statusSchema.safeParse(req.body)

  if (!validation.success) {
    return sendError(res, 400, 'A valid isActive value is required.')
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingZone = await tx.geofenceZone.findUnique({
        where: { id: idValidation.data },
      })

      if (!existingZone) {
        return { notFound: true }
      }

      const zone = await tx.geofenceZone.update({
        where: { id: idValidation.data },
        data: validation.data,
      })

      await writeGeofenceAudit(
        tx,
        req,
        zone.isActive
          ? 'GEOFENCE_ZONE_ENABLED'
          : 'GEOFENCE_ZONE_DISABLED',
        zone,
        {
          previousIsActive: existingZone.isActive,
        }
      )

      return { zone }
    })

    if (result.notFound) {
      return sendError(res, 404, 'Geofence zone not found.')
    }

    return res.status(200).json({
      success: true,
      message: result.zone.isActive
        ? 'Geofence zone enabled successfully.'
        : 'Geofence zone disabled successfully.',
      zone: result.zone,
    })
  } catch (error) {
    console.error('Geofence status update failed:', error.message)

    if (error?.code === 'P2025') {
      return sendError(res, 404, 'Geofence zone not found.')
    }

    return sendError(res, 500, 'Unable to update geofence status.')
  }
})

router.delete('/:id', async (req, res) => {
  const idValidation = idSchema.safeParse(req.params.id)

  if (!idValidation.success) {
    return sendError(res, 400, 'Invalid geofence ID.')
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingZone = await tx.geofenceZone.findUnique({
        where: { id: idValidation.data },
      })

      if (!existingZone) {
        return { notFound: true }
      }

      const activeSessions = await tx.attendanceSession.count({
        where: { status: 'ACTIVE' },
      })

      if (activeSessions > 0) {
        return { activeSessions: true }
      }

      await writeGeofenceAudit(
        tx,
        req,
        'GEOFENCE_ZONE_DELETED',
        existingZone
      )

      await tx.geofenceZone.delete({
        where: { id: idValidation.data },
      })

      return { deleted: true }
    })

    if (result.notFound) {
      return sendError(res, 404, 'Geofence zone not found.')
    }

    if (result.activeSessions) {
      return sendError(
        res,
        409,
        'Geofence zones cannot be permanently deleted while attendance sessions are active. Disable the zone instead.'
      )
    }

    return res.status(200).json({
      success: true,
      message: 'Geofence zone deleted successfully.',
    })
  } catch (error) {
    console.error('Geofence deletion failed:', error.message)

    if (error?.code === 'P2025') {
      return sendError(res, 404, 'Geofence zone not found.')
    }

    return sendError(res, 500, 'Unable to delete geofence zone.')
  }
})

export default router
