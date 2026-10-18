import { useEffect, useState } from 'react'
import './AdminProfile.css'

export default function AdminProfile({ admin, onClose, onSave }) {
  const [name, setName] = useState(admin?.name || admin?.fullName || '')
  const [email] = useState(admin?.email || '')
  const [photoUrl, setPhotoUrl] = useState(admin?.photoUrl || admin?.avatarUrl || '')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(admin?.name || admin?.fullName || '')
    setPhotoUrl(admin?.photoUrl || admin?.avatarUrl || '')
    setPhotoFile(null)
    setSaveError('')
  }, [admin?.id, admin?.name, admin?.fullName, admin?.photoUrl, admin?.avatarUrl])

  useEffect(() => {
    return () => {
      if (photoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoUrl)
      }
    }
  }, [photoUrl])

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    setPhotoError('')
    setSaveError('')

    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Please choose a JPG, PNG or WebP image.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo must be 5 MB or smaller.')
      event.target.value = ''
      return
    }

    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    setSaveError('')

    try {
      await onSave?.({
        name: name.trim(),
        email,
        photoUrl,
        photoFile,
      })
    } catch (error) {
      setSaveError(error?.message || 'Profile could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AD'

  return (
    <div className="admin-profile-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.()
    }}>
      <section className="admin-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-profile-title">
        <header className="admin-profile-dialog-header">
          <div>
            <span className="admin-profile-eyebrow">ACCOUNT SETTINGS</span>
            <h2 id="admin-profile-title">Admin profile</h2>
            <p>Manage the name and photo shown in your workspace.</p>
          </div>
          <button className="admin-profile-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="admin-profile-photo-section">
            <div className="admin-profile-photo">
              {photoUrl
                ? <img src={photoUrl} alt="Admin profile preview" />
                : <span>{initials}</span>}
            </div>
            <div className="admin-profile-photo-actions">
              <label className="admin-profile-upload-button">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} />
                <span aria-hidden="true">↑</span> Choose photo
              </label>
              <small>JPG, PNG or WebP · Maximum 5 MB</small>
              {photoError && <p className="admin-profile-error" role="alert">{photoError}</p>}
            </div>
          </div>

          <label className="admin-profile-field">
            <span>Admin name <b>*</b></span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="Enter your name"
              autoComplete="name"
            />
          </label>

          <label className="admin-profile-field">
            <span>Email address</span>
            <input value={email} readOnly aria-readonly="true" />
            <small>Email is read from your current Admin account.</small>
          </label>

          {saveError && (
            <p className="admin-profile-error" role="alert">{saveError}</p>
          )}

          <div className="admin-profile-notice">
            <span aria-hidden="true">i</span>
            <p>Your name and selected photo will be saved to your Admin account when you choose Save profile.</p>
          </div>

          <footer className="admin-profile-dialog-actions">
            <button className="admin-profile-cancel" type="button" onClick={onClose}>Cancel</button>
            <button className="admin-profile-save" type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
