
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './GeofenceManagement.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const emptyForm = {
  areaName: '',
  zoneName: '',
  latitude: '',
  longitude: '',
  radiusMeters: '100',
}

export default function GeofenceManagement({ onNotify }) {
  const navigate = useNavigate()

  const [zones, setZones] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [deleteConfirmationZone, setDeleteConfirmationZone] = useState(null)

  function notify(message, type = 'success') {
    if (onNotify) {
      onNotify(message, type)
    }
  }

  async function request(url, options = {}) {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })

    const result = await response.json().catch(() => ({}))

    if (response.status === 401 || response.status === 403) {
      navigate('/admin/login', { replace: true })
      throw new Error('Admin authentication required.')
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Geofence request failed.')
    }

    return result
  }

  async function loadZones() {
    setIsLoading(true)

    try {
      const result = await request('/api/admin/geofences')
      setZones(Array.isArray(result.zones) ? result.zones : [])
    } catch (error) {
      notify(error.message || 'Unable to load geofence zones.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadZones()
  }, [])

  function updateForm(event) {
    const { name, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: value,
    }))

    setFieldErrors((current) => ({
      ...current,
      [name]: '',
    }))
  }

  function openAddForm() {
    setForm({ ...emptyForm })
    setFieldErrors({})
    setEditingId(null)
    setShowForm(true)
  }

  function openEditForm(zone) {
    setForm({
      areaName: zone.areaName,
      zoneName: zone.zoneName,
      latitude: String(zone.latitude),
      longitude: String(zone.longitude),
      radiusMeters: String(zone.radiusMeters),
    })

    setFieldErrors({})
    setEditingId(zone.id)
    setShowForm(true)
  }

  function closeForm() {
    if (isSaving) return

    setShowForm(false)
    setEditingId(null)
    setForm({ ...emptyForm })
    setFieldErrors({})
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (isSaving) return

    const latitude = Number(form.latitude)
    const longitude = Number(form.longitude)
    const radiusMeters = Number(form.radiusMeters)
    const errors = {}

    if (!form.areaName.trim()) {
      errors.areaName = 'Please enter the area or building name.'
    }

    if (!form.zoneName.trim()) {
      errors.zoneName = 'Please enter the circle name.'
    }

    if (
      form.latitude.trim() === '' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      errors.latitude = 'Enter a valid latitude between -90 and 90.'
    }

    if (
      form.longitude.trim() === '' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      errors.longitude = 'Enter a valid longitude between -180 and 180.'
    }

    if (
      form.radiusMeters.trim() === '' ||
      !Number.isInteger(radiusMeters) ||
      radiusMeters < 1 ||
      radiusMeters > 1000
    ) {
      errors.radiusMeters = 'Radius must be between 1 and 1000 meters.'
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) return

    const payload = {
      areaName: form.areaName.trim(),
      zoneName: form.zoneName.trim(),
      latitude,
      longitude,
      radiusMeters,
    }

    setIsSaving(true)

    try {
      const result = await request(
        editingId
          ? `/api/admin/geofences/${encodeURIComponent(editingId)}`
          : '/api/admin/geofences',
        {
          method: editingId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      )

      notify(result.message || 'Geofence saved successfully.')

      setShowForm(false)
      setEditingId(null)
      setForm({ ...emptyForm })

      await loadZones()
    } catch (error) {
      notify(error.message || 'Unable to save geofence.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleZone(zone) {
    if (actionId) return

    setActionId(zone.id)

    try {
      const result = await request(
        `/api/admin/geofences/${encodeURIComponent(zone.id)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            isActive: !zone.isActive,
          }),
        }
      )

      notify(result.message || 'Geofence status updated.')
      await loadZones()
    } catch (error) {
      notify(error.message || 'Unable to update geofence status.', 'error')
    } finally {
      setActionId(null)
    }
  }

  function deleteZone(zone) {
    if (actionId) return
    setDeleteConfirmationZone(zone)
  }

  async function confirmDeleteZone() {
    const zone = deleteConfirmationZone

    if (!zone || actionId) return

    setActionId(zone.id)

    try {
      const result = await request(
        `/api/admin/geofences/${encodeURIComponent(zone.id)}`,
        {
          method: 'DELETE',
        }
      )

      setDeleteConfirmationZone(null)
      notify(result.message || 'Geofence deleted successfully.')
      await loadZones()
    } catch (error) {
      notify(error.message || 'Unable to delete geofence.', 'error')
    } finally {
      setActionId(null)
    }
  }

  const activeCount = zones.filter((zone) => zone.isActive).length
  const inactiveCount = zones.length - activeCount

  return (
    <div className="geofence-management">
      <section className="geofence-heading">
        <div>
          <p className="geofence-eyebrow">LOCATION MANAGEMENT</p>
          <h1>Geofence Management</h1>
          <p className="geofence-subtitle">
            Manage campus location zones used for student location verification.
          </p>
        </div>

        <button
          className="geofence-primary-button"
          type="button"
          onClick={openAddForm}
        >
          <span>＋</span> Add new circle
        </button>
      </section>

      <section className="geofence-stat-grid">
        <article className="geofence-stat-card">
          <span>Total circles</span>
          <strong>{zones.length}</strong>
        </article>

        <article className="geofence-stat-card">
          <span>Active circles</span>
          <strong>{activeCount}</strong>
        </article>

        <article className="geofence-stat-card">
          <span>Disabled circles</span>
          <strong>{inactiveCount}</strong>
        </article>
      </section>

      <section className="geofence-panel">
        <div className="geofence-panel-heading">
          <div>
            <h2>Campus location circles</h2>
            <p>
              Each circle is managed independently. Students can pass location
              verification inside any active circle.
            </p>
          </div>

          <button
            className="geofence-refresh-button"
            type="button"
            onClick={loadZones}
            disabled={isLoading}
          >
            ↻ Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="geofence-empty-state">
            Loading geofence circles...
          </div>
        ) : zones.length === 0 ? (
          <div className="geofence-empty-state">
            <span className="geofence-empty-icon">◎</span>
            <h3>No geofence circles yet</h3>
            <p>
              Add your first campus circle to start configuring location zones.
            </p>
            <button
              className="geofence-primary-button"
              type="button"
              onClick={openAddForm}
            >
              ＋ Add first circle
            </button>
          </div>
        ) : (
          <div className="geofence-table-wrap">
            <table className="geofence-table">
              <thead>
                <tr>
                  <th>Area / Building</th>
                  <th>Circle name</th>
                  <th>Coordinates</th>
                  <th>Radius</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <strong>{zone.areaName}</strong>
                    </td>

                    <td>{zone.zoneName}</td>

                    <td>
                      <span className="geofence-coordinates">
                        {Number(zone.latitude).toFixed(6)},
                        {' '}
                        {Number(zone.longitude).toFixed(6)}
                      </span>
                    </td>

                    <td>{zone.radiusMeters} m</td>

                    <td>
                      <span
                        className={`geofence-status ${
                          zone.isActive ? 'active' : 'inactive'
                        }`}
                      >
                        {zone.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>

                    <td>
                      <div className="geofence-actions">
                        <button
                          type="button"
                          onClick={() => openEditForm(zone)}
                          disabled={Boolean(actionId)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleZone(zone)}
                          disabled={Boolean(actionId)}
                        >
                          {actionId === zone.id
                            ? 'Updating...'
                            : zone.isActive
                              ? 'Disable'
                              : 'Enable'}
                        </button>

                        <button
                          className="delete"
                          type="button"
                          onClick={() => deleteZone(zone)}
                          disabled={Boolean(actionId)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deleteConfirmationZone && (
        <div
          className="geofence-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionId) {
              setDeleteConfirmationZone(null)
            }
          }}
        >
          <section
            className="geofence-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="geofence-delete-title"
          >
            <div className="geofence-delete-icon" aria-hidden="true">!</div>
            <p className="geofence-eyebrow">DELETE CAMPUS CIRCLE</p>
            <h2 id="geofence-delete-title">Delete this circle?</h2>
            <p className="geofence-delete-message">
              Are you sure you want to permanently delete{' '}
              <strong>{deleteConfirmationZone.zoneName}</strong> from{' '}
              <strong>{deleteConfirmationZone.areaName}</strong>? This action cannot be undone.
            </p>
            <div className="geofence-modal-actions">
              <button
                className="geofence-secondary-button"
                type="button"
                onClick={() => setDeleteConfirmationZone(null)}
                disabled={Boolean(actionId)}
              >
                Cancel
              </button>
              <button
                className="geofence-delete-confirm-button"
                type="button"
                onClick={confirmDeleteZone}
                disabled={Boolean(actionId)}
              >
                {actionId === deleteConfirmationZone.id ? 'Deleting...' : 'Yes, delete circle'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div
          className="geofence-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <section
            className="geofence-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="geofence-modal-title"
          >
            <div className="geofence-modal-heading">
              <div>
                <p className="geofence-eyebrow">CAMPUS LOCATION</p>
                <h2 id="geofence-modal-title">
                  {editingId ? 'Edit geofence circle' : 'Add new circle'}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={isSaving}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="geofence-form-grid">
                <label>
                  Area / Building name
                  <input
                    name="areaName"
                    aria-invalid={Boolean(fieldErrors.areaName)}
                    aria-describedby={fieldErrors.areaName ? 'geofence-areaName-error' : undefined}
                    value={form.areaName}
                    onChange={updateForm}
                    required
                    maxLength={120}
                    placeholder="e.g. CSIT Building"
                  />
                  {fieldErrors.areaName && (
                    <small id="geofence-areaName-error" className="geofence-field-error" role="alert">
                      {fieldErrors.areaName}
                    </small>
                  )}
                </label>

                <label>
                  Circle name
                  <input
                    name="zoneName"
                    aria-invalid={Boolean(fieldErrors.zoneName)}
                    aria-describedby={fieldErrors.zoneName ? 'geofence-zoneName-error' : undefined}
                    value={form.zoneName}
                    onChange={updateForm}
                    required
                    maxLength={120}
                    placeholder="e.g. CSIT Circle 1"
                  />
                  {fieldErrors.zoneName && (
                    <small id="geofence-zoneName-error" className="geofence-field-error" role="alert">
                      {fieldErrors.zoneName}
                    </small>
                  )}
                </label>

                <label>
                  Latitude
                  <input
                    name="latitude"
                    aria-invalid={Boolean(fieldErrors.latitude)}
                    aria-describedby={fieldErrors.latitude ? 'geofence-latitude-error' : undefined}
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={form.latitude}
                    onChange={updateForm}
                    required
                    placeholder="e.g. 30.123456"
                  />
                  {fieldErrors.latitude && (
                    <small id="geofence-latitude-error" className="geofence-field-error" role="alert">
                      {fieldErrors.latitude}
                    </small>
                  )}
                </label>

                <label>
                  Longitude
                  <input
                    name="longitude"
                    aria-invalid={Boolean(fieldErrors.longitude)}
                    aria-describedby={fieldErrors.longitude ? 'geofence-longitude-error' : undefined}
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={form.longitude}
                    onChange={updateForm}
                    required
                    placeholder="e.g. 78.123456"
                  />
                  {fieldErrors.longitude && (
                    <small id="geofence-longitude-error" className="geofence-field-error" role="alert">
                      {fieldErrors.longitude}
                    </small>
                  )}
                </label>

                <label className="full">
                  Radius (meters)
                  <input
                    name="radiusMeters"
                    aria-invalid={Boolean(fieldErrors.radiusMeters)}
                    aria-describedby={fieldErrors.radiusMeters ? 'geofence-radiusMeters-error' : undefined}
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={form.radiusMeters}
                    onChange={updateForm}
                    required
                  />
                  {fieldErrors.radiusMeters && (
                    <small id="geofence-radiusMeters-error" className="geofence-field-error" role="alert">
                      {fieldErrors.radiusMeters}
                    </small>
                  )}
                  <small>Minimum 1 meter and maximum 1000 meters.</small>
                </label>
              </div>

              <div className="geofence-form-note">
                Location coordinates define the centre of this circle.
                Multiple circles can be created for the same building.
              </div>

              <div className="geofence-modal-actions">
                <button
                  className="geofence-secondary-button"
                  type="button"
                  onClick={closeForm}
                  disabled={isSaving}
                >
                  Cancel
                </button>

                <button
                  className="geofence-primary-button"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving
                    ? 'Saving...'
                    : editingId
                      ? 'Save changes'
                      : 'Create circle'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
