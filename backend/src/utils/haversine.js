
const EARTH_RADIUS_METERS = 6_371_000

function validateCoordinates(latitude, longitude, label) {
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new TypeError(`${label} latitude must be between -90 and 90.`)
  }

  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TypeError(`${label} longitude must be between -180 and 180.`)
  }
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * Calculate great-circle distance between two GPS coordinates.
 * Returns distance in meters.
 *
 * Coordinates must be numeric latitude/longitude values.
 */
export function calculateDistanceMeters(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  validateCoordinates(latitude1, longitude1, 'First')
  validateCoordinates(latitude2, longitude2, 'Second')

  const lat1 = toRadians(latitude1)
  const lat2 = toRadians(latitude2)
  const deltaLat = toRadians(latitude2 - latitude1)
  const deltaLon = toRadians(longitude2 - longitude1)

  const sinLat = Math.sin(deltaLat / 2)
  const sinLon = Math.sin(deltaLon / 2)

  const haversine =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon

  // Clamp floating-point rounding errors to the valid range [0, 1].
  const safeHaversine = Math.min(1, Math.max(0, haversine))

  const centralAngle =
    2 * Math.atan2(
      Math.sqrt(safeHaversine),
      Math.sqrt(1 - safeHaversine)
    )

  return EARTH_RADIUS_METERS * centralAngle
}

/**
 * Determine whether the calculated distance is within the configured radius.
 * Boundary is inclusive: distance equal to radius is considered inside.
 */
export function isWithinRadius(distanceMeters, radiusMeters) {
  if (
    typeof distanceMeters !== 'number' ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0
  ) {
    throw new TypeError('Distance must be a valid non-negative number.')
  }

  if (
    typeof radiusMeters !== 'number' ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters < 0
  ) {
    throw new TypeError('Radius must be a valid non-negative number.')
  }

  return distanceMeters <= radiusMeters
}
