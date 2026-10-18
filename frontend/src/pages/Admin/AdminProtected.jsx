import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export default function AdminProtected() {
  const [status, setStatus] = useState('checking')
  const [retryCount, setRetryCount] = useState(0)

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
      <main role="status" aria-live="polite" aria-label="Checking administrator session" style={styles.page}>
        <style>{`
          @keyframes attendx-spin { to { transform: rotate(360deg); } }
          @keyframes attendx-pulse {
            0%, 100% { opacity: .65; transform: scale(.98); }
            50% { opacity: 1; transform: scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            .attendx-loading-spinner, .attendx-loading-mark { animation: none !important; }
          }
        `}</style>
        <section style={styles.loadingCard}>
          <div className="attendx-loading-mark" style={styles.brandMark}>A</div>
          <div style={styles.brandName}>Attend<span style={{ color: '#5146e5' }}>X</span></div>
          <div style={styles.brandCaption}>SMART ATTENDANCE</div>
          <div className="attendx-loading-spinner" style={styles.spinner} />
          <h1 style={styles.loadingTitle}>Securing your workspace</h1>
          <p style={styles.loadingText}>Checking your administrator session…</p>
          <div style={styles.progressTrack}><div style={styles.progressBar} /></div>
          <p style={styles.secureNote}><span aria-hidden="true">●</span> Protected Admin access</p>
        </section>
      </main>
    )
  }

  if (status === 'unauthenticated') return <Navigate to="/admin/login" replace />

  if (status === 'error') {
    return (
      <main style={styles.page} role="alert">
        <section style={styles.errorCard}>
          <div style={styles.errorIcon}>!</div>
          <h1 style={styles.loadingTitle}>Unable to verify your session</h1>
          <p style={styles.loadingText}>
            AttendX could not confirm your Admin login. Check that the backend is running and your connection is available, then try again.
          </p>
          <button type="button" style={styles.retryButton} onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
          <button type="button" style={styles.loginButton} onClick={() => window.location.assign('/admin/login')}>Go to Admin login</button>
        </section>
      </main>
    )
  }

  return <Outlet />
}

const styles = {
  page: {
    minHeight: '100vh', width: '100%', boxSizing: 'border-box', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
    background: 'radial-gradient(circle at 50% 10%, #eeedff 0, #f7f8fc 42%, #f3f5fb 100%)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#17233b',
  },
  loadingCard: {
    width: '100%', maxWidth: '390px', boxSizing: 'border-box', display: 'flex',
    flexDirection: 'column', alignItems: 'center', padding: '38px 32px 28px',
    border: '1px solid #e5e7f4', borderRadius: '22px', background: 'rgba(255,255,255,.94)',
    boxShadow: '0 24px 70px rgba(37, 42, 92, .10)', textAlign: 'center',
  },
  brandMark: {
    width: '54px', height: '54px', display: 'grid', placeItems: 'center', borderRadius: '17px',
    background: 'linear-gradient(145deg, #6757f5, #4338ca)', color: '#fff', fontSize: '28px',
    fontWeight: 800, boxShadow: '0 10px 22px rgba(79, 70, 229, .24)',
    animation: 'attendx-pulse 2s ease-in-out infinite',
  },
  brandName: { marginTop: '13px', fontSize: '23px', lineHeight: 1.2, fontWeight: 800, letterSpacing: '-.7px' },
  brandCaption: { marginTop: '5px', color: '#8992aa', fontSize: '9px', fontWeight: 800, letterSpacing: '2px' },
  spinner: {
    width: '35px', height: '35px', marginTop: '30px', border: '3px solid #e5e7ff',
    borderTopColor: '#5146e5', borderRightColor: '#8177f6', borderRadius: '50%',
    animation: 'attendx-spin .85s linear infinite',
  },
  loadingTitle: { margin: '22px 0 0', fontSize: '19px', lineHeight: 1.35, fontWeight: 750, letterSpacing: '-.3px' },
  loadingText: { maxWidth: '300px', margin: '9px 0 0', color: '#737e98', fontSize: '13px', lineHeight: 1.65 },
  progressTrack: { width: '100%', height: '4px', marginTop: '23px', overflow: 'hidden', borderRadius: '99px', background: '#ececff' },
  progressBar: { width: '45%', height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg, #5146e5, #a49cff)' },
  secureNote: { margin: '17px 0 0', color: '#8a94aa', fontSize: '11px' },
  errorCard: {
    width: '100%', maxWidth: '420px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '34px 30px', border: '1px solid #e5e7f4', borderRadius: '20px',
    background: '#fff', boxShadow: '0 24px 70px rgba(37, 42, 92, .10)', textAlign: 'center',
  },
  errorIcon: { width: '44px', height: '44px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#fff1f2', color: '#be123c', fontSize: '24px', fontWeight: 800 },
  retryButton: { width: '100%', minHeight: '43px', marginTop: '22px', border: 0, borderRadius: '10px', background: '#5146e5', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  loginButton: { marginTop: '10px', padding: '9px 12px', border: 0, background: 'transparent', color: '#5146e5', fontSize: '12px', fontWeight: 700, cursor: 'pointer' },
}