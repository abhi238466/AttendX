
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './TeacherChangePassword.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export default function TeacherChangePassword() {
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    if (loading || success) return

    setError('')

    if (newPassword.length < 8) {
      setError('New password must contain at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    if (currentPassword && currentPassword === newPassword) {
      setError('New password must be different from the current password.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/teacher/change-password`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(currentPassword ? { currentPassword } : {}),
            newPassword,
          }),
        },
      )

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          result.error || result.message || 'Password change failed.',
        )
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)

      // Replace the password-change history entry so Back does not reopen
      // the old form. TeacherProtected verifies the updated session.
      navigate('/teacher/dashboard', { replace: true })
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Unable to connect to the server. Please try again.'
          : err.message || 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="teacher-password-page">
      <div className="teacher-password-decoration teacher-password-decoration-one" />
      <div className="teacher-password-decoration teacher-password-decoration-two" />

      <section className="teacher-password-card">
        <Link className="teacher-password-brand" to="/" aria-label="AttendX home">
          Attend<span>X</span>
        </Link>

        {!success ? (
          <>
            <div className="teacher-password-heading">
              <div className="teacher-password-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  <path d="M12 14v3" />
                </svg>
              </div>

              <div className="teacher-password-eyebrow">ACCOUNT SECURITY</div>

              <h1>Set a new password</h1>

              <p className="teacher-password-description">
                Create a new password to keep your teacher account secure
                and continue to your workspace.
              </p>
            </div>

            <form className="teacher-password-form" onSubmit={handleSubmit}>
              <div className="teacher-password-field">
                <label htmlFor="teacher-current-password">
                  Current password <span>(if required)</span>
                </label>

                <input
                  id="teacher-current-password"
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  maxLength={128}
                  placeholder="Enter current password"
                  disabled={loading}
                />
              </div>

              <div className="teacher-password-field">
                <label htmlFor="teacher-new-password">New password</label>

                <input
                  id="teacher-new-password"
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                  placeholder="At least 8 characters"
                  disabled={loading}
                />
              </div>

              <div className="teacher-password-field">
                <label htmlFor="teacher-confirm-password">
                  Confirm new password
                </label>

                <input
                  id="teacher-confirm-password"
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                  placeholder="Re-enter new password"
                  disabled={loading}
                />
              </div>

              <label className="teacher-password-show">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(event) => setShowPasswords(event.target.checked)}
                  disabled={loading}
                />
                <span>Show passwords</span>
              </label>

              {error && (
                <div
                  className="teacher-password-message teacher-password-error"
                  role="alert"
                >
                  <span aria-hidden="true">!</span>
                  <p>{error}</p>
                </div>
              )}

              <button
                className="teacher-password-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="teacher-password-spinner" />
                    Updating password...
                  </>
                ) : (
                  <>
                    Change password
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="teacher-password-note">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 7.5v.1" />
              </svg>
              <p>
                Use at least 8 characters and choose a password you have not
                used before.
              </p>
            </div>

            <Link className="teacher-password-back" to="/teacher/login">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              Back to Login
            </Link>
          </>
        ) : (
          <div className="teacher-password-success-view" role="status">
            <div className="teacher-password-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="m5 12 4.5 4.5L19 7" />
              </svg>
            </div>

            <div className="teacher-password-eyebrow">PASSWORD UPDATED</div>

            <h1>Password changed successfully!</h1>

            <p>
              Your new password has been saved. Continue to your teacher
              dashboard.
            </p>

            <button
              className="teacher-password-submit"
              type="button"
              onClick={() => navigate('/teacher/dashboard', { replace: true })}
            >
              Go to Dashboard
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        )}

        <div className="teacher-password-footer">
          Secure access for authorized teachers
        </div>
      </section>
    </main>
  )
}
