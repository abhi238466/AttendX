import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  QrCode,
  ShieldCheck,
} from 'lucide-react'
import './StudentAttendance.css'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ''

function readError(payload, fallback) {
  return payload?.message || payload?.error || fallback
}

// Stable browser token used by the server to lock this device per attendance session.
// This is an identifier, not authentication; the server stores only its SHA-256 hash.
let memoryDeviceToken = ''

function getDeviceToken() {
  const storageKey = 'attendx:deviceToken'

  try {
    const storedToken = localStorage.getItem(storageKey)
    if (storedToken && storedToken.length >= 32) return storedToken
  } catch {
    // Continue with an in-memory token if browser storage is unavailable.
  }

  if (!memoryDeviceToken) {
    const bytes = new Uint8Array(32)

    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes)
      memoryDeviceToken = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    } else {
      // Modern browsers provide crypto.getRandomValues; fail closed if unavailable.
      throw new Error('Secure device identification is unavailable. Please use an updated browser.')
    }
  }

  try {
    localStorage.setItem(storageKey, memoryDeviceToken)
  } catch {
    // The in-memory token remains usable for this page session.
  }

  return memoryDeviceToken
}

export default function StudentAttendance() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialToken = useMemo(
    () =>
      searchParams.get('token') ||
      searchParams.get('code') ||
      searchParams.get('textCode') ||
      '',
    [searchParams],
  )
  const initialSessionId =
    searchParams.get('attendanceSessionId') ||
    searchParams.get('sessionId') ||
    ''

  const [code, setCode] = useState(initialToken)
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [stage, setStage] = useState(initialToken ? 'verify' : 'code')
  const autoVerifyKey = useRef('')
  const [challenge, setChallenge] = useState(null)
  const [form, setForm] = useState({
    fullName: '',
    classRollNumber: '',
    universityRollNumber: '',
    section: '',
  })
  const [location, setLocation] = useState(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!error) return

    const timeoutId = window.setTimeout(() => {
      setError('')
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [error])

  useEffect(() => {
    if (!initialToken) return

    const key = `${initialSessionId}:${initialToken}`
    if (autoVerifyKey.current === key) return
    autoVerifyKey.current = key

    setCode(initialToken)
    setSessionId(initialSessionId)
    setStage('verify')
    verifyCode(null, initialToken, initialSessionId)
    // This effect intentionally runs only when QR/code URL parameters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken, initialSessionId])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function verifyCode(event, tokenOverride = null, sessionIdOverride = null) {
    event?.preventDefault()
    setError('')
    setSuccess('')

    const normalized = (tokenOverride ?? code).trim()
    const activeSessionId = sessionIdOverride ?? sessionId
    if (!normalized) {
      setError('Please enter the current attendance code or scan the QR code.')
      return
    }

    const isTextCode = /^[A-Z]{2}\d{6}$/i.test(normalized)
    if (!isTextCode && !activeSessionId) {
      setError('QR information is incomplete. Please scan the QR code again.')
      return
    }

    setBusy(true)
    try {
      const body = {
        token: normalized,
        deviceToken: getDeviceToken(),
      }
      if (!isTextCode) body.attendanceSessionId = activeSessionId

      const response = await fetch(`${API_BASE}/api/attendance/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok || payload.success === false) {
        throw new Error(readError(payload, 'Code verification failed. Please try again.'))
      }

      if (!payload.attendanceSessionId || !payload.challengeToken) {
        throw new Error('The server response is incomplete. Please try again.')
      }

      setSessionId(payload.attendanceSessionId)

      // Convenience lock for the same browser. The backend remains the source
      // of truth, because browser storage can be cleared or unavailable.
      try {
        const previousRoll = localStorage.getItem('attendx:lastUniversityRoll') || ''
        const lockKey = `attendx:marked:${payload.attendanceSessionId}:${previousRoll.trim().replace(/\s+/g, '').toUpperCase()}`
        if (previousRoll && localStorage.getItem(lockKey) === '1') {
          setChallenge(null)
          setError('')
          setSuccess('Your attendance has already been marked for this session.')
          setStage('locked')
          return
        }
      } catch {
        // Continue normally if browser storage is blocked.
      }

      setChallenge({
        attendanceSessionId: payload.attendanceSessionId,
        challengeToken: payload.challengeToken,
        challengeExpiresAt: payload.challengeExpiresAt,
        sections: Array.isArray(payload.sections) ? payload.sections : [],
      })
      setForm((current) => ({
        ...current,
        section:
          current.section && payload.sections?.includes(current.section)
            ? current.section
            : (payload.sections?.[0] || ''),
      }))
      setLocation(null)
      setLocationMessage('')
      setStage('form')
    } catch (err) {
      setError(err.message || 'Could not verify the code.')
    } finally {
      setBusy(false)
    }
  }

  function captureLocation() {
    setError('')
    setLocationMessage('Getting your current location…')

    if (!navigator.geolocation) {
      setLocationMessage('')
      setError('This browser does not support location. Please use a supported browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationAccuracyMeters: position.coords.accuracy,
          locationCapturedAt: new Date().toISOString(),
        }
        setLocation(nextLocation)
        setLocationMessage(
          `Location captured (accuracy approximately ${Math.round(position.coords.accuracy)} m).`,
        )
      },
      (geoError) => {
        setLocation(null)
        setLocationMessage('')
        const messages = {
          1: 'Location permission was denied. Allow location access and try again.',
          2: 'Your location could not be determined. Please try again outdoors or near a window.',
          3: 'Location request timed out. Please try again.',
        }
        setError(messages[geoError.code] || 'Could not get your location. Please try again.')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }

  async function submitAttendance(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!challenge) {
      setError('Please verify the current attendance code again.')
      setStage('code')
      return
    }
    if (!location) {
      setError('Capture your current location before submitting attendance.')
      return
    }
    if (location.locationAccuracyMeters > 50) {
      setError('Location accuracy is too low. Try again with precise location enabled.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch(`${API_BASE}/api/attendance/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceSessionId: challenge.attendanceSessionId,
          challengeToken: challenge.challengeToken,
          deviceToken: getDeviceToken(),
          fullName: form.fullName.trim(),
          classRollNumber: form.classRollNumber.trim(),
          universityRollNumber: form.universityRollNumber.trim(),
          section: form.section,
          ...location,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok || payload.success === false) {
        throw new Error(readError(payload, 'Attendance could not be submitted. Please try again.'))
      }

      setSuccess(payload.message || 'Attendance marked successfully.')
      try {
        const normalizedRoll = form.universityRollNumber.trim().replace(/\s+/g, '').toUpperCase()
        localStorage.setItem('attendx:lastUniversityRoll', form.universityRollNumber.trim())
        localStorage.setItem(`attendx:marked:${challenge.attendanceSessionId}:${normalizedRoll}`, '1')
      } catch {
        // Backend duplicate protection still applies if storage is unavailable.
      }
      setStage('success')
    } catch (err) {
      setError(err.message || 'Attendance could not be submitted.')
      if (/already been marked|already marked for this session|already been submitted/i.test(err.message || '')) {
        setChallenge(null)
        setSuccess('Your attendance has already been marked for this session.')
        setStage('locked')
      } else if (/verification has expired|already used|current QR\/code again/i.test(err.message || '')) {
        setChallenge(null)
        setStage('code')
      }
    } finally {
      setBusy(false)
    }
  }

  function startAgain() {
    setCode('')
    setSessionId('')
    setChallenge(null)
    setLocation(null)
    setLocationMessage('')
    setError('')
    setSuccess('')
    setStage('code')
    navigate('/student/attendance', { replace: true })
  }

  return (
    <main className="student-attendance-page">
      <div className="student-attendance-shell">
        <button
          className="student-back-button"
          type="button"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={17} />
          Back to Home
        </button>

        <header className="student-attendance-header">
          <div className="student-attendance-logo"><ClipboardCheck size={25} /></div>
          <p className="student-eyebrow">ATTENDX · STUDENT PORTAL</p>
          <h1>Mark your attendance</h1>
          <p className="student-subtitle">
            Scan your teacher’s QR code to continue automatically, or enter the current text code below.
          </p>
        </header>

        {error && (
          <div className="student-alert student-alert-error" role="alert">
            {error}
          </div>
        )}

        {stage === 'code' && (
          <section className="student-panel">
            <div className="student-panel-icon"><QrCode size={23} /></div>
            <h2>Verify attendance code</h2>
            <p className="student-panel-copy">
              Use the latest code displayed by your teacher. Codes expire automatically.
            </p>
            <form onSubmit={verifyCode}>
              <label htmlFor="attendance-code">Text code</label>
              <input
                id="attendance-code"
                name="code"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={8}
                placeholder="AB123456"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))}
                required
              />
              <button className="student-primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="student-spin" size={18} /> : <ShieldCheck size={18} />}
                {busy ? 'Verifying…' : 'Verify and Continue'}
              </button>
            </form>
            <p className="student-security-note">
              <ShieldCheck size={15} /> Attendance is recorded only after verification and location checks.
            </p>
          </section>
        )}

        {stage === 'form' && challenge && (
          <section className="student-panel">
            <div className="student-verified-label"><CheckCircle2 size={17} /> Code verified</div>
            <h2>Your details</h2>
            <p className="student-panel-copy">Enter your details exactly as registered with your institution.</p>
            <form onSubmit={submitAttendance}>
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" name="fullName" value={form.fullName} onChange={updateField} autoComplete="name" minLength={2} maxLength={120} required />

              <div className="student-form-grid">
                <div>
                  <label htmlFor="classRollNumber">Class roll number</label>
                  <input id="classRollNumber" name="classRollNumber" value={form.classRollNumber} onChange={updateField} maxLength={50} required />
                </div>
                <div>
                  <label htmlFor="universityRollNumber">University roll number</label>
                  <input id="universityRollNumber" name="universityRollNumber" value={form.universityRollNumber} onChange={updateField} maxLength={80} required />
                </div>
              </div>

              <label htmlFor="section">Section</label>
              {challenge.sections.length > 0 ? (
                <select id="section" name="section" value={form.section} onChange={updateField} required>
                  <option value="" disabled>Select your section</option>
                  {challenge.sections.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              ) : (
                <input id="section" name="section" value={form.section} onChange={updateField} placeholder="Enter your section" maxLength={50} required />
              )}

              <div className="student-location-box">
                <div className="student-location-heading">
                  <MapPin size={20} />
                  <div>
                    <strong>Current location</strong>
                    <p>Required to check that you are within the classroom attendance area.</p>
                  </div>
                </div>
                <button className="student-secondary-button" type="button" onClick={captureLocation} disabled={busy}>
                  <MapPin size={17} /> Capture current location
                </button>
                {locationMessage && <p className="student-location-message">{locationMessage}</p>}
              </div>

              <button className="student-primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="student-spin" size={18} /> : <ClipboardCheck size={18} />}
                {busy ? 'Submitting…' : 'Submit Attendance'}
              </button>
              <button className="student-text-button" type="button" onClick={() => { setChallenge(null); setStage('code'); setError('') }}>
                Use a different code
              </button>
            </form>
          </section>
        )}

        {stage === 'locked' && (
          <section className="student-panel student-success-panel">
            <div className="student-success-icon"><LockKeyhole size={34} /></div>
            <h2>Attendance already marked</h2>
            <p>{success || 'Your attendance has already been marked for this session.'}</p>
            <p className="student-success-detail">
              This session is locked for you. Scanning the QR code again will not create another attendance record.
            </p>
            <button className="student-primary-button" type="button" onClick={() => navigate('/')}>
              Back to Home
            </button>
          </section>
        )}

        {stage === 'verify' && (
          <section className="student-panel">
            <div className="student-panel-icon"><LoaderCircle className="student-spin" size={23} /></div>
            <h2>Verifying attendance</h2>
            <p className="student-panel-copy">Checking your teacher’s current attendance session. Please wait…</p>
          </section>
        )}

        {stage === 'success' && (
          <section className="student-panel student-success-panel">
            <div className="student-success-icon"><CheckCircle2 size={34} /></div>
            <h2>Attendance submitted</h2>
            <p>{success || 'Your attendance has been marked successfully.'}</p>
            <p className="student-success-detail">
              Your submission was accepted by AttendX. You may safely close this page.
            </p>
            <button className="student-primary-button" type="button" onClick={startAgain}>
              Done
            </button>
          </section>
        )}

        <footer className="student-attendance-footer">
          <ShieldCheck size={15} />
          Secure attendance verification · AttendX
        </footer>
      </div>
    </main>
  )
}