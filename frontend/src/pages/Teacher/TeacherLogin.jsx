
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './TeacherLogin.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export default function TeacherLogin() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function checkSession() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/teacher/me`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })

        const result = await response.json().catch(() => ({}))

        if (cancelled) return

        if (response.ok && result.teacher?.id) {
          navigate(
            result.teacher.mustChangePassword
              ? '/teacher/change-password'
              : '/teacher/dashboard',
            { replace: true },
          )
          return
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !cancelled) {
          // Keep the login form available if session verification cannot connect.
        }
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }

    checkSession()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [navigate])

  async function handleSubmit(event) {
    event.preventDefault()

    if (loading || checkingSession) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/teacher/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      const result = await response.json().catch(() => ({}))

      // Show the backend's exact message, including invalid credentials,
      // 15-minute lockout, and Admin-deactivated account messages.
      if (!response.ok) {
        throw new Error(
          result.error || result.message || 'Login failed. Please try again.',
        )
      }

      if (!result.teacher?.id) {
        throw new Error('The server returned an invalid login response.')
      }

      navigate(
        result.teacher.mustChangePassword
          ? '/teacher/change-password'
          : '/teacher/dashboard',
      )
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Unable to connect to the server. Please check your connection.'
          : err.message || 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="teacher-login-page">
        <section className="teacher-login-card" role="status">
          <Link className="teacher-login-brand" to="/">
            Attend<span>X</span>
          </Link>
          <p>Checking your session...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="teacher-login-page">
      <div className="teacher-login-decoration teacher-login-decoration-one" />
      <div className="teacher-login-decoration teacher-login-decoration-two" />

      <section className="teacher-login-card">
        <Link className="teacher-login-brand" to="/" aria-label="AttendX home">
          Attend<span>X</span>
        </Link>

        <div className="teacher-login-heading">
          <div className="teacher-login-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </div>

          <div className="teacher-login-eyebrow">TEACHER PORTAL</div>
          <h1>Welcome back</h1>
          <p className="teacher-login-description">
            Sign in to manage your classroom attendance and session records.
          </p>
        </div>

        <form className="teacher-login-form" onSubmit={handleSubmit}>
          <div className="teacher-login-field">
            <label htmlFor="teacher-login-email">Email address</label>

            <div className="teacher-login-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" />
              </svg>

              <input
                id="teacher-login-email"
                type="email"
                autoComplete="username"
                placeholder="Enter your registered email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (error) setError('')
                }}
                maxLength={254}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="teacher-login-field">
            <label htmlFor="teacher-login-password">Password</label>

            <div className="teacher-login-input-wrap teacher-login-password-wrap">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>

              <input
                id="teacher-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError('')
                }}
                maxLength={128}
                required
                disabled={loading}
              />

              <button
                className="teacher-login-password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                disabled={loading}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="teacher-login-error" role="alert" aria-live="polite">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.1" />
              </svg>
              <p>{error}</p>
            </div>
          )}

          <button
            className="teacher-login-submit"
            type="submit"
            disabled={loading || checkingSession}
          >
            {loading ? (
              <>
                <span className="teacher-login-spinner" />
                Signing in...
              </>
            ) : (
              <>
                Sign in securely
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="teacher-login-account-note">
          <span className="teacher-login-note-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 7.5v.1" />
            </svg>
          </span>
          <p>
            Teacher accounts are created and managed by your administrator.
          </p>
        </div>

        <div className="teacher-login-divider">
          <span />
          <span>ATTENDX</span>
          <span />
        </div>

        <Link className="teacher-login-home" to="/">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          <span>Back to Home</span>
        </Link>

        <p className="teacher-login-footer">
          Secure access for authorized teachers
        </p>
      </section>
    </main>
  )
}
