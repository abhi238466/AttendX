import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import './AdminProtected.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export default function AdminProtected() {
  const [status, setStatus] = useState('checking')
  const [retryCount, setRetryCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function checkAdminSession() {
      setStatus('checking')

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/admin/me`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })

        const result = await response.json().catch(() => ({}))

        if (cancelled) return

        if (response.ok && result.success && result.user?.role === 'ADMIN') {
          setStatus('authenticated')
        } else if (response.status === 401 || response.status === 403) {
          setStatus('unauthenticated')
        } else {
          setStatus('error')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    checkAdminSession()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [retryCount])

  if (status === 'checking') {
    return (
      <main className="attendx-admin-protected-page" role="status" aria-live="polite">
        <section className="attendx-admin-protected-loading-card">
          <div className="attendx-admin-protected-brand-mark">A</div>
          <div className="attendx-admin-protected-brand-name">
            Attend<span className="attendx-admin-protected-brand-accent">X</span>
          </div>
          <div className="attendx-admin-protected-brand-caption">SMART ATTENDANCE</div>
          <div className="attendx-admin-protected-spinner" />
          <h1 className="attendx-admin-protected-loading-title">Securing your workspace</h1>
          <p className="attendx-admin-protected-loading-text">
            Checking your administrator session…
          </p>
          <div className="attendx-admin-protected-progress-track">
            <div className="attendx-admin-protected-progress-bar" />
          </div>
          <p className="attendx-admin-protected-secure-note">
            <span aria-hidden="true">●</span> Protected Admin access
          </p>
        </section>
      </main>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/admin/login" replace />
  }

  if (status === 'error') {
    return (
      <main className="attendx-admin-protected-page" role="alert">
        <section className="attendx-admin-protected-error-card">
          <div className="attendx-admin-protected-error-icon">!</div>
          <h1 className="attendx-admin-protected-loading-title">
            Unable to verify your session
          </h1>
          <p className="attendx-admin-protected-loading-text">
            AttendX could not confirm your Admin login. Check that the
            backend is running and your connection is available, then try again.
          </p>

          <button
            type="button"
            className="attendx-admin-protected-retry-button"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Try again
          </button>

          <button
            type="button"
            className="attendx-admin-protected-login-button"
            onClick={() => navigate('/admin/login', { replace: true })}
          >
            Go to Admin login
          </button>
        </section>
      </main>
    )
  }

  return <Outlet />
}
