import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
ArrowLeft,
Clock3,
MapPin,
QrCode,
RefreshCw,
ShieldCheck,
Users,
XCircle,
} from 'lucide-react'
import './LiveAttendance.css'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ''
).replace(/\/$/, '')
const TOKEN_REFRESH_SECONDS = 50

async function readResponse(response) {
const result = await response.json().catch(() => ({}))

if (!response.ok) {
throw new Error(
result.message || result.error || 'The request could not be completed.'
)
}

return result
}

function formatDateTime(value) {
if (!value) return '—'

const date = new Date(value)

if (Number.isNaN(date.getTime())) return '—'

return date.toLocaleString([], {
dateStyle: 'medium',
timeStyle: 'medium',
})
}

function formatRemainingTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export default function LiveAttendance() {
const { sessionId } = useParams()
const navigate = useNavigate()

const [session, setSession] = useState(null)
const [tokenData, setTokenData] = useState(null)
const [secondsLeft, setSecondsLeft] = useState(0)
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(0)
const [loading, setLoading] = useState(true)
const [refreshing, setRefreshing] = useState(false)
const [closing, setClosing] = useState(false)
const [error, setError] = useState('')
const [notice, setNotice] = useState('')
const [closed, setClosed] = useState(false)
const [showCloseConfirm, setShowCloseConfirm] = useState(false)
const refreshInFlightRef = useRef(false)
const autoCloseStartedRef = useRef(false)

const loadSession = useCallback(async () => {
const result = await readResponse(
await fetch(`${API_BASE_URL}/api/teacher/sessions`, {
credentials: 'include',
headers: { Accept: 'application/json' },
cache: 'no-store',
})
)

const currentSession = (result.sessions || []).find(
  (item) => item.id === sessionId
)

if (!currentSession) {
  throw new Error(
    'Session not found in your teacher account. It may not exist or may belong to another teacher.'
  )
}

setSession(currentSession)

if (currentSession.status !== 'ACTIVE') {
  setClosed(true)
}

return currentSession

}, [sessionId])

const refreshToken = useCallback(async (manual = false) => {
if (!sessionId || closed || refreshInFlightRef.current) return

refreshInFlightRef.current = true
setRefreshing(true)
setError('')
if (manual) setNotice('')

try {
  const result = await readResponse(
    await fetch(
      `${API_BASE_URL}/api/teacher/sessions/${encodeURIComponent(sessionId)}/tokens/rotate`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        cache: 'no-store',
      }
    )
  )

  setTokenData(result)
  setSecondsLeft(
    Number.isFinite(result.expiresInSeconds)
      ? result.expiresInSeconds
      : TOKEN_REFRESH_SECONDS
  )

  if (manual) setNotice('QR code and text code refreshed.')
} catch (requestError) {
  setError(requestError.message || 'Could not refresh the attendance code.')

  if (
    requestError.message?.toLowerCase().includes('ended') ||
    requestError.message?.toLowerCase().includes('not active')
  ) {
    setClosed(true)
  }
} finally {
  refreshInFlightRef.current = false
  setRefreshing(false)
}

}, [sessionId, closed])

useEffect(() => {
let cancelled = false

async function initialize() {
  setLoading(true)
  setError('')

  try {
    await loadSession()

    if (!cancelled) {
      await refreshToken()
    }
  } catch (requestError) {
    if (!cancelled) {
      setError(requestError.message || 'Could not load this session.')
    }
  } finally {
    if (!cancelled) setLoading(false)
  }
}

if (!sessionId) {
  setError('The session ID is missing from this page URL.')
  setLoading(false)
} else {
  initialize()
}

return () => {
  cancelled = true
}

}, [sessionId, loadSession, refreshToken])

useEffect(() => {
  if (!session?.endsAt) {
    setSessionSecondsLeft(0)
    return undefined
  }

  const updateSessionCountdown = () => {
    const remainingMs = new Date(session.endsAt).getTime() - Date.now()
    setSessionSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)))
  }

  updateSessionCountdown()
  const timer = window.setInterval(updateSessionCountdown, 1000)
  return () => window.clearInterval(timer)
}, [session?.endsAt])

useEffect(() => {
if (!tokenData || closed) return undefined

const countdown = window.setInterval(() => {
  setSecondsLeft((current) => Math.max(0, current - 1))
}, 1000)

return () => window.clearInterval(countdown)

}, [tokenData, closed])

useEffect(() => {
if (loading || closed || !session || session.status !== 'ACTIVE') {
return undefined
}

const refreshTimer = window.setInterval(() => {
  refreshToken()
}, TOKEN_REFRESH_SECONDS * 1000)

return () => window.clearInterval(refreshTimer)

}, [loading, closed, session, refreshToken])

async function handleCloseSession(auto = false) {
if (closing || closed) return

if (!auto) setShowCloseConfirm(false)
setClosing(true)
setError('')
setNotice('')

try {
  await readResponse(
    await fetch(
      `${API_BASE_URL}/api/teacher/sessions/${encodeURIComponent(sessionId)}/close`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }
    )
  )

  setClosed(true)
  setSession((current) =>
    current ? { ...current, status: 'CLOSED' } : current
  )
  setTokenData(null)
  setNotice(auto ? 'Session time ended. Attendance session closed automatically.' : 'Attendance session closed successfully.')
} catch (requestError) {
  setError(requestError.message || 'Could not close this session.')
} finally {
  setClosing(false)
}

}

useEffect(() => {
  if (
    loading ||
    closed ||
    closing ||
    !session ||
    session.status !== 'ACTIVE' ||
    sessionSecondsLeft > 0 ||
    autoCloseStartedRef.current
  ) {
    return undefined
  }

  autoCloseStartedRef.current = true
  handleCloseSession(true)
  return undefined
}, [loading, closed, closing, session, sessionSecondsLeft])

if (loading) {
return (
<main className="la-page">
<div className="la-loading">
<span className="la-spinner" />
<p>Loading live attendance...</p>
</div>
</main>
)
}

return (
<main className="la-page">
<div className="la-shell">
<header className="la-header">
<button
type="button"
className="la-back-button"
onClick={() => navigate('/teacher/dashboard')}
>
<ArrowLeft size={17} />
Back to Dashboard
</button>

      <div className="la-heading-row">
        <div>
          <p className="la-eyebrow">ATTENDX · TEACHER WORKSPACE</p>
          <h1>Live Attendance</h1>
          <p className="la-subtitle">
            Display the current QR code or text code for your class.
          </p>
        </div>

        <span className={`la-status ${closed ? 'is-closed' : 'is-live'}`}>
          <span className="la-status-dot" />
          {closed ? 'Session closed' : 'Live session'}
        </span>
      </div>
    </header>

    {(error || notice) && (
      <div className="la-toast-stack" aria-live="polite" aria-atomic="true">
        {error && (
          <div className="la-toast la-toast-error" role="alert">
            <XCircle size={18} />
            <span>{error}</span>
            <button type="button" className="la-toast-dismiss" aria-label="Dismiss error" onClick={() => setError('')}>×</button>
          </div>
        )}
        {notice && (
          <div className="la-toast la-toast-success" role="status">
            <ShieldCheck size={18} />
            <span>{notice}</span>
            <button type="button" className="la-toast-dismiss" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button>
          </div>
        )}
      </div>
    )}

    {session && (
      <section className="la-session-card">
        <div className="la-session-icon">
          <QrCode size={23} />
        </div>

        <div className="la-session-details">
          <p className="la-card-label">CURRENT CLASS</p>
          <h2>{session.subjectName || 'Class attendance'}</h2>
          <p>
            {session.courseName}
            {session.className ? ` · ${session.className}` : ''}
            {session.roomName ? ` · ${session.roomName}` : ''}
          </p>
        </div>

        <div className="la-session-meta">
          <span>
            <Users size={15} />
            {(session.sections || []).join(', ') || 'Sections not listed'}
          </span>
          <span className="la-session-end-time">
            <Clock3 size={15} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span>Ends {formatDateTime(session.endsAt)}</span>
              <strong className={sessionSecondsLeft <= 60 ? 'is-expiring' : ''}>
                {closed ? 'Session ended' : `${formatRemainingTime(sessionSecondsLeft)} remaining`}
              </strong>
            </span>
          </span>
          <span>
            <MapPin size={15} />
            Radius {session.radiusMeters} m
          </span>
        </div>
      </section>
    )}

    <div className="la-content-grid">
      <section className="la-card la-qr-card">
        <div className="la-card-heading">
          <div>
            <h2>Scan QR Code</h2>
            <p>Students should scan the currently displayed code.</p>
          </div>
          <span className="la-icon-bubble">
            <QrCode size={20} />
          </span>
        </div>

        <div className="la-qr-stage">
          {tokenData?.attendanceUrl && !closed ? (
            <div className="la-qr-frame">
              <QRCodeSVG
                value={tokenData.attendanceUrl}
                size={224}
                level="M"
                marginSize={2}
                title="AttendX live attendance QR code"
              />
            </div>
          ) : (
            <div className="la-qr-placeholder">
              <QrCode size={42} />
              <span>
                {closed ? 'This session is closed' : 'QR code unavailable'}
              </span>
            </div>
          )}
        </div>

        <div className="la-expiry-row">
          <span className="la-expiry-label">
            <Clock3 size={15} />
            {closed ? 'Session ended' : 'Code refreshes automatically'}
          </span>

          {!closed && (
            <strong className={secondsLeft <= 4 ? 'is-expiring' : ''}>
              {secondsLeft}s
            </strong>
          )}
        </div>

        <div className="la-progress-track" aria-hidden="true">
          <div
            className="la-progress-value"
            style={{
              width: `${closed ? 0 : Math.min(100, (secondsLeft / TOKEN_REFRESH_SECONDS) * 100)}%`,
            }}
          />
        </div>

        <p className="la-security-note">
          <ShieldCheck size={16} />
          Previous codes are revoked when a new code is generated.
        </p>

        <a
          className={`la-student-link ${!tokenData?.attendanceUrl || closed ? 'is-disabled' : ''}`}
          href={tokenData?.attendanceUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!tokenData?.attendanceUrl || closed}
          onClick={(event) => {
            if (!tokenData?.attendanceUrl || closed) event.preventDefault()
          }}
        >
          Open student attendance page
        </a>
      </section>

      <section className="la-card la-code-card">
        <div className="la-card-heading">
          <div>
            <h2>Manual Attendance Code</h2>
            <p>Students can enter this code if they cannot scan the QR.</p>
          </div>
          <span className="la-icon-bubble la-icon-blue">
            <ShieldCheck size={20} />
          </span>
        </div>

        <div className="la-code-panel">
          <span className="la-code-label">CURRENT TEXT CODE</span>
          <strong className="la-code-value">
            {closed ? 'CLOSED' : tokenData?.textCode || '—'}
          </strong>
          <span className="la-code-hint">
            {closed
              ? 'This code can no longer be used.'
              : `Expires ${formatDateTime(tokenData?.expiresAt)}`}
          </span>
        </div>

        <div className="la-expiry-row la-text-code-expiry-row">
          <span className="la-expiry-label">
            <Clock3 size={15} />
            {closed ? 'Text code expired' : 'Text code refreshes automatically'}
          </span>
          {!closed && (
            <strong className={secondsLeft <= 4 ? 'is-expiring' : ''}>
              {secondsLeft}s
            </strong>
          )}
        </div>
        <div className="la-progress-track" aria-hidden="true">
          <div
            className="la-progress-value"
            style={{
              width: `${closed ? 0 : Math.min(100, (secondsLeft / TOKEN_REFRESH_SECONDS) * 100)}%`,
            }}
          />
        </div>

        <button
          type="button"
          className="la-secondary-button"
          onClick={() => refreshToken(true)}
          disabled={refreshing || closed}
        >
          <RefreshCw size={16} className={refreshing ? 'la-spin' : ''} />
          {refreshing ? 'Refreshing code...' : 'Refresh code now'}
        </button>

        <div className="la-instructions">
          <h3>Before students submit</h3>
          <ul>
            <li>Use the code currently displayed on this screen.</li>
            <li>Each student must submit their own current location.</li>
            <li>Expired, replaced or already-used challenges are rejected by the server.</li>
          </ul>
        </div>

        <button
          type="button"
          className="la-close-button"
          onClick={() => setShowCloseConfirm(true)}
          disabled={closing || closed}
        >
          <XCircle size={17} />
          {closing ? 'Closing session...' : closed ? 'Session closed' : 'Close attendance session'}
        </button>
      </section>
    </div>

    {showCloseConfirm && !closed && (
      <div className="la-confirm-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closing) setShowCloseConfirm(false)
      }}>
        <section className="la-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="la-confirm-title">
          <span className="la-confirm-icon"><XCircle size={24} /></span>
          <h2 id="la-confirm-title">Close attendance session?</h2>
          <p>Students will no longer be able to submit attendance using this session’s QR code or text code. Attendance already saved will remain unchanged.</p>
          <div className="la-confirm-actions">
            <button type="button" className="la-confirm-cancel" onClick={() => setShowCloseConfirm(false)} disabled={closing}>Keep session open</button>
            <button type="button" className="la-confirm-submit" onClick={() => handleCloseSession(false)} disabled={closing}>
              {closing ? 'Closing session...' : 'Yes, close session'}
            </button>
          </div>
        </section>
      </div>
    )}

    <footer className="la-footer">
      <span>AttendX</span>
      <span>Live attendance · Session-specific codes</span>
    </footer>
  </div>
</main>

)
}