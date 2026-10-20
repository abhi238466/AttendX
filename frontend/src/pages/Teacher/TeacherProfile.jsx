import { useEffect, useRef, useState } from 'react'
import './TeacherProfile.css'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ''

function getInitials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'T'
  )
}

export default function TeacherProfile({ teacher: initialTeacher, onBack }) {
  const [teacher, setTeacher] = useState(initialTeacher || null)
  const [loading, setLoading] = useState(!initialTeacher)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(
          `${API_BASE}/api/auth/teacher/me`,
          { credentials: 'include' },
        )

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Unable to load profile.')
        }

        const profile = data.teacher || data

        if (!cancelled) {
          setTeacher(profile)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to load profile.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [])

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo size must be less than 5 MB.')
      return
    }

    const formData = new FormData()
    formData.append('photo', file)

    try {
      setUploading(true)
      setError('')
      setMessage('')

      const response = await fetch(
        `${API_BASE}/api/auth/teacher/profile/photo`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        },
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Unable to upload photo.')
      }

      let updatedTeacher = data.teacher

      if (!updatedTeacher) {
        const profileResponse = await fetch(
          `${API_BASE}/api/auth/teacher/me`,
          { credentials: 'include' },
        )

        const profileData = await profileResponse.json().catch(() => ({}))

        if (!profileResponse.ok) {
          throw new Error(
            profileData.error ||
              profileData.message ||
              'Unable to refresh profile.',
          )
        }

        updatedTeacher = profileData.teacher || profileData
      }

      setTeacher((current) => ({ ...current, ...updatedTeacher }))
      setMessage('Profile photo updated successfully.')
    } catch (err) {
      setError(err.message || 'Unable to upload photo.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <main className="teacher-profile-page">
        <div className="teacher-profile-card teacher-profile-loading">
          <div
            className="teacher-profile-spinner"
            role="status"
            aria-label="Loading profile"
          />
          <p className="teacher-profile-loading-text">
            Loading your profile...
          </p>
        </div>
      </main>
    )
  }

  if (error && !teacher) {
    return (
      <main className="teacher-profile-page">
        <div className="teacher-profile-card">
          <p className="teacher-profile-error">{error}</p>
          <button
            type="button"
            className="teacher-profile-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </main>
    )
  }

  const photoUrl = teacher?.photoUrl
  const currentName =
    teacher?.profileName ||
    teacher?.displayName ||
    teacher?.fullName ||
    'Teacher'

  return (
    <main className="teacher-profile-page">
      <section className="teacher-profile-card">
        <div className="teacher-profile-heading">
          <span className="teacher-profile-eyebrow">
            TEACHER ACCOUNT
          </span>
          <h1>My Profile</h1>
          <p>View your account details and manage your profile photo.</p>
        </div>

        <div className="teacher-profile-photo-section">
          <div className="teacher-profile-avatar">
            {photoUrl ? (
              <img
                key={photoUrl}
                src={photoUrl}
                alt={`${currentName} profile`}
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <span>{getInitials(currentName)}</span>
            )}
          </div>

          <div className="teacher-profile-photo-info">
            <h2>{currentName}</h2>
            <p>{teacher?.email || ''}</p>

            <input
              ref={fileInputRef}
              className="teacher-profile-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
            />

            <button
              type="button"
              className="teacher-profile-button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading
                ? 'Uploading...'
                : photoUrl
                  ? 'Change Photo'
                  : 'Upload Photo'}
            </button>

            <small>JPG, PNG, or WebP · Maximum 5 MB</small>
          </div>
        </div>

        {message && (
          <p className="teacher-profile-success" role="status">
            {message}
          </p>
        )}

        {error && (
          <p className="teacher-profile-error" role="alert">
            {error}
          </p>
        )}

        <div className="teacher-profile-details">
          <h3>Account Details</h3>

          <div className="teacher-profile-detail">
            <span>Teacher ID</span>
            <strong>{teacher?.teacherId || '—'}</strong>
          </div>

          <div className="teacher-profile-detail">
            <span>Email</span>
            <strong>{teacher?.email || '—'}</strong>
          </div>

          <div className="teacher-profile-detail">
            <span>Phone</span>
            <strong>{teacher?.phone || '—'}</strong>
          </div>

          <div className="teacher-profile-detail">
            <span>Qualification</span>
            <strong>{teacher?.highestQualification || '—'}</strong>
          </div>
        </div>

        {onBack && (
          <button
            type="button"
            className="teacher-profile-back-button"
            onClick={onBack}
          >
            Back to Dashboard
          </button>
        )}
      </section>
    </main>
  )
}