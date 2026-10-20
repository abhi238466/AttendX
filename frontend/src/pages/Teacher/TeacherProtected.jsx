
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './TeacherProtected.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export default function TeacherProtected() {
  const [status, setStatus] = useState('checking')
  const [teacher, setTeacher] = useState(null)
  const [retry, setRetry] = useState(0)

  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function verifySession() {
      setStatus('checking')
      setTeacher(null)

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
          setTeacher(result.teacher)
          setStatus('authenticated')
        } else if (response.status === 401 || response.status === 403) {
          setStatus('unauthenticated')
        } else {
          setStatus('error')
        }
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          setStatus('error')
        }
      }
    }

    verifySession()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [retry])

  if (status === 'checking') {
    return (
      <main className="teacher-protected-loading" role="status">
        <div className="teacher-protected-spinner" />
        <p>Verifying your teacher session...</p>
      </main>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <Navigate
        to="/teacher/login"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  if (status === 'error') {
    return (
      <main className="teacher-protected-error">
        <h1>Unable to verify your session</h1>
        <p>Please check your connection and try again.</p>

        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>

        <button
          type="button"
          onClick={() => navigate('/teacher/login', { replace: true })}
        >
          Go to Teacher Login
        </button>
      </main>
    )
  }

  const onPasswordPage = location.pathname === '/teacher/change-password'

  if (teacher?.mustChangePassword && !onPasswordPage) {
    return <Navigate to="/teacher/change-password" replace />
  }

  if (!teacher?.mustChangePassword && onPasswordPage) {
    return <Navigate to="/teacher/dashboard" replace />
  }

  return <Outlet context={{ teacher }} />
}
