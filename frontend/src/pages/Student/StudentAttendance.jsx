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

const MAX_LOCATION_ACCURACY_METERS = 100

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
  const [locationMessage, setLocationMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [symbolChallenge, setSymbolChallenge] = useState(null)
  const [selectedSymbols, setSelectedSymbols] = useState(['', '', ''])
  const [symbolSecondsLeft, setSymbolSecondsLeft] = useState(0)
  const [symbolClockOffset, setSymbolClockOffset] = useState(0)
  const [violationWarning, setViolationWarning] = useState('')
  const [violationCount, setViolationCount] = useState(0)
  const [violationSyncFailed, setViolationSyncFailed] = useState(false)
  const [violationPending, setViolationPending] = useState(false)
  const [securityLocked, setSecurityLocked] = useState(false)
  const violationIncidentRef = useRef(false)
  const violationIncidentIdRef = useRef('')
  const fullscreenActiveRef = useRef(false)
  const verifyRequestPendingRef = useRef(false)
  const violationReasonRef = useRef('')
  const retryViolationRef = useRef(null)
  const codeRequestPendingRef = useRef(false)
  const symbolChallengeRequestPendingRef = useRef(false)
  const symbolVerifyRequestPendingRef = useRef(false)
  const symbolLocationRef = useRef(null)

  useEffect(() => {
    if (!error) return

    const timeoutId = window.setTimeout(() => {
      setError('')
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [error])

  useEffect(() => {
    if (stage !== 'symbols' || !symbolChallenge?.expiresAt) return

    const updateCountdown = () => {
      const serverNow = Date.now() + symbolClockOffset
      const remaining = Math.max(
        0,
        Math.ceil((new Date(symbolChallenge.expiresAt).getTime() - serverNow) / 1000),
      )
      setSymbolSecondsLeft(remaining)

      if (remaining === 0 && !verifyRequestPendingRef.current) {
        fullscreenActiveRef.current = false
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        }
        setSymbolChallenge(null)
        setSelectedSymbols(['', '', ''])
        setError('')
        setLocationMessage('')
        setStage('waiting')
      }
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 250)

    return () => window.clearInterval(intervalId)
  }, [stage, symbolChallenge, symbolClockOffset, challenge])

  useEffect(() => {
    if (stage !== 'symbols' || !challenge || !symbolChallenge) return

    const reportViolation = async (reason) => {
      if (violationIncidentRef.current || stage !== 'symbols') return
      violationIncidentRef.current = true
      violationReasonRef.current = reason
      if (!violationIncidentIdRef.current) {
        violationIncidentIdRef.current = globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
      setViolationPending(true)
      setViolationWarning('Recording this security event…')
      setViolationSyncFailed(false)

      try {
        const response = await fetch(`${API_BASE}/api/attendance/symbol/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendanceSessionId: challenge.attendanceSessionId,
            challengeToken: challenge.challengeToken,
            deviceToken: getDeviceToken(),
            universityRollNumber: form.universityRollNumber.trim(),
            violationType: reason,
            incidentId: violationIncidentIdRef.current,
          }),
        })
        const payload = await response.json().catch(() => ({}))

        if (response.status === 423 || payload.locked) {
          setChallenge(null)
          setSymbolChallenge(null)
          setSecurityLocked(true)
          setSuccess('Two security violations detected. This device is locked for this attendance session.')
          setViolationWarning('Two security violations detected. This device is locked for this attendance session.')
          setStage('locked')
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {})
          }
          return
        }

        if (!response.ok || payload.success === false) {
          throw new Error(readError(payload, 'The security event could not be recorded.'))
        }

        setViolationCount(payload.violationCount || 1)
        violationIncidentIdRef.current = ''
        setViolationWarning(payload.message || 'Warning: Stay on this attendance verification screen. One more violation will lock this device for this session.')
      } catch (err) {
        violationIncidentRef.current = false
        setViolationSyncFailed(true)
        setViolationWarning(`${err.message || 'Security event could not be recorded.'} Retry the security check before continuing.`)
      } finally {
        setViolationPending(false)
      }
    }

    retryViolationRef.current = reportViolation

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('TAB_SWITCH')
      }
    }

    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement)
      if (fullscreenActiveRef.current && !isFullscreen) {
        fullscreenActiveRef.current = false
        reportViolation('FULLSCREEN_EXIT')
      } else if (isFullscreen) {
        fullscreenActiveRef.current = true
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [stage, challenge, symbolChallenge, form.universityRollNumber])

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
    if (codeRequestPendingRef.current) return
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

    codeRequestPendingRef.current = true
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
      setLocationMessage('')
      setSymbolChallenge(null)
      setSelectedSymbols(['', '', ''])
      setStage('roll')
    } catch (err) {
      setError(err.message || 'Could not verify the code.')
    } finally {
      codeRequestPendingRef.current = false
      setBusy(false)
    }
  }

  function getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('This browser does not support location. Please use a supported browser.'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            locationAccuracyMeters: position.coords.accuracy,
            locationCapturedAt: new Date().toISOString(),
          })
        },
        (geoError) => {
          const messages = {
            1: 'Location permission was denied. Allow location access and try again.',
            2: 'Your location could not be determined. Please try again outdoors or near a window.',
            3: 'Location request timed out. Please try again.',
          }
          reject(new Error(messages[geoError.code] || 'Could not get your location. Please try again.'))
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      )
    })
  }


  async function refreshSymbolChallenge() {
    if (!challenge || symbolChallengeRequestPendingRef.current) return

    symbolChallengeRequestPendingRef.current = true
    setBusy(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/attendance/symbol/current`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceSessionId: challenge.attendanceSessionId,
          challengeToken: challenge.challengeToken,
          deviceToken: getDeviceToken(),
          universityRollNumber: form.universityRollNumber.trim(),
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (response.status === 202 && payload.waiting) return
      if (!response.ok || !payload.success) {
        throw new Error(readError(payload, 'Could not load the teacher’s symbol challenge.'))
      }
      if (!payload.symbolChallenge) {
        throw new Error('The current symbol challenge is not available yet. Please refresh again.')
      }

      activateSymbolChallenge(payload.symbolChallenge)
      setLocationMessage('Campus location verified. Complete the three symbol selections within 15 seconds.')
    } catch (err) {
      const message = err.message || 'Could not load the symbol challenge.'
      setError(message)
      if (/QR\/text verification expired|session has ended|not open/i.test(message)) {
        setChallenge(null)
        setStage('code')
      }
    } finally {
      symbolChallengeRequestPendingRef.current = false
      setBusy(false)
    }
  }

  async function startSymbolChallenge(event) {
    event.preventDefault()
    if (symbolChallengeRequestPendingRef.current) return
    setError('')
    setViolationWarning('')
    setViolationCount(0)
    setViolationSyncFailed(false)
    setViolationPending(false)
    setSecurityLocked(false)
    violationIncidentRef.current = false
    fullscreenActiveRef.current = false

    const normalizedForm = {
      fullName: form.fullName.trim(),
      classRollNumber: form.classRollNumber.trim(),
      universityRollNumber: form.universityRollNumber.trim(),
      section: form.section.trim(),
    }

    if (normalizedForm.fullName.length < 2 || !normalizedForm.classRollNumber ||
        !normalizedForm.universityRollNumber || !normalizedForm.section) {
      setError('Please complete all student details before continuing.')
      return
    }

    if (!challenge) {
      setError('Please verify the current attendance code again.')
      setStage('code')
      return
    }

    symbolChallengeRequestPendingRef.current = true
    setBusy(true)
    setLocationMessage('Checking your campus location…')

    try {
      const currentLocation = await getCurrentLocation()
      if (currentLocation.locationAccuracyMeters > MAX_LOCATION_ACCURACY_METERS) {
        throw new Error('Location accuracy is too low. Try again with precise location enabled.')
      }

      const requestBody = {
        attendanceSessionId: challenge.attendanceSessionId,
        challengeToken: challenge.challengeToken,
        deviceToken: getDeviceToken(),
        universityRollNumber: normalizedForm.universityRollNumber,
        ...currentLocation,
      }

      const initialResponse = await fetch(`${API_BASE}/api/attendance/symbol/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const initialPayload = await initialResponse.json().catch(() => ({}))

      if (initialResponse.ok && initialPayload.success && initialPayload.symbolChallenge) {
        activateSymbolChallenge(initialPayload.symbolChallenge)
        setLocationMessage('Campus location verified. Complete the three symbol selections within 15 seconds.')
        return
      }

      const initialMessage = readError(initialPayload, '')
      const isWaiting = initialResponse.status === 202 && initialPayload.waiting

      if (!isWaiting) {
        throw new Error(initialMessage || 'Campus location verification could not be completed.')
      }

      setLocationMessage('')
      setStage('waiting')
    } catch (err) {
      setLocationMessage('')
      setError(err.message || 'Could not start symbol verification.')
      setStage('roll')
    } finally {
      symbolChallengeRequestPendingRef.current = false
      setBusy(false)
    }
  }

  function activateSymbolChallenge(nextChallenge) {
    if (!Array.isArray(nextChallenge?.symbols) ||
        nextChallenge.symbols.length !== 3 ||
        nextChallenge.symbols.some((row) => !Array.isArray(row) || row.length !== 3)) {
      throw new Error('The symbol grid received from the server is invalid. Please try again.')
    }

    const serverTime = new Date(nextChallenge.serverTime).getTime()
    const expiresAt = new Date(nextChallenge.expiresAt).getTime()
    if (!Number.isFinite(serverTime) || !Number.isFinite(expiresAt) || expiresAt <= serverTime) {
      throw new Error('The symbol challenge timing is invalid. Please ask your teacher to generate it again.')
    }

    setSymbolClockOffset(serverTime - Date.now())
    setSymbolChallenge(nextChallenge)
    symbolLocationRef.current = null
    getCurrentLocation().then((reading) => {
      symbolLocationRef.current = reading
    }).catch(() => {})
    violationIncidentRef.current = false
    setViolationWarning('')
    setSelectedSymbols(['', '', ''])
    setStage('symbols')
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => {
        fullscreenActiveRef.current = true
      }).catch(() => {
        fullscreenActiveRef.current = false
      })
    }
  }

  async function verifySymbols(event) {
    event.preventDefault()
    if (symbolVerifyRequestPendingRef.current) return
    setError('')

    if (!challenge || !symbolChallenge) {
      setError('The symbol challenge is missing. Please start verification again.')
      setStage('roll')
      return
    }

    if (selectedSymbols.some((symbol) => !symbol)) {
      setError('Please select one symbol from each of the three rows.')
      return
    }

    if (symbolSecondsLeft <= 0) {
      setError('The 15-second selection window has ended. Ask your teacher to generate a new sequence.')
      return
    }

    symbolVerifyRequestPendingRef.current = true
    setBusy(true)
    verifyRequestPendingRef.current = true
    setLocationMessage('Capturing a fresh location and submitting attendance…')

    try {
      const cachedLocation = symbolLocationRef.current
      const cachedLocationAge = cachedLocation
        ? Date.now() - new Date(cachedLocation.locationCapturedAt).getTime()
        : Infinity
      const freshLocation =
        cachedLocation && cachedLocationAge >= 0 && cachedLocationAge <= 30_000
          ? cachedLocation
          : await getCurrentLocation()
      if (freshLocation.locationAccuracyMeters > MAX_LOCATION_ACCURACY_METERS) {
        throw new Error('Location accuracy is too low. Enable precise location and try again.')
      }

      const response = await fetch(`${API_BASE}/api/attendance/symbol/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceSessionId: challenge.attendanceSessionId,
          challengeToken: challenge.challengeToken,
          deviceToken: getDeviceToken(),
          universityRollNumber: form.universityRollNumber.trim(),
          fullName: form.fullName.trim(),
          classRollNumber: form.classRollNumber.trim(),
          section: form.section.trim(),
          answers: selectedSymbols,
          ...freshLocation,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok || payload.success === false) {
        throw new Error(readError(payload, 'Symbol verification or attendance submission failed.'))
      }

      const deadline = new Date(symbolChallenge.expiresAt).getTime()
      const serverNow = Date.now() + symbolClockOffset
      const remainingMs = Math.max(0, deadline - serverNow)

      setLocationMessage('Attendance has been saved. Completing the verification window…')
      fullscreenActiveRef.current = false
      setStage('saving-confirmed')
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
      if (remainingMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMs))
      }

      setSuccess(payload.message || 'Attendance marked successfully.')
      setSymbolChallenge(null)
      setSelectedSymbols(['', '', ''])
      setStage('success')
    } catch (err) {
      setError(err.message || 'Attendance could not be submitted.')
      if (/already marked|already been marked|locked|three incorrect attempts/i.test(err.message || '')) {
        setChallenge(null)
        setSymbolChallenge(null)
        setSuccess(err.message)
        setStage('locked')
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        }
        fullscreenActiveRef.current = false
      } else if (/symbol challenge expired/i.test(err.message || '')) {
        setSymbolChallenge(null)
        setSelectedSymbols(['', '', ''])
        setLocationMessage('')
        setError('')
        setStage('waiting')
      } else if (/reload the symbol challenge|teacher has not generated a symbol challenge/i.test(err.message || '')) {
        setSymbolChallenge(null)
        setSelectedSymbols(['', '', ''])
        setLocationMessage('')
        setStage('waiting')
      } else if (/QR\/text verification expired|verification expired or was already used|attendance deadline has passed|session has ended|not open/i.test(err.message || '')) {
        setChallenge(null)
        setSymbolChallenge(null)
        setSelectedSymbols(['', '', ''])
        setLocationMessage('')
        setStage('code')
      }
    } finally {
      verifyRequestPendingRef.current = false
      symbolVerifyRequestPendingRef.current = false
      setBusy(false)
    }
  }

  function retrySecurityViolation() {
    if (violationPending || !violationSyncFailed) return
    retryViolationRef.current?.(violationReasonRef.current || 'FULLSCREEN_EXIT')
  }

  function continueAfterWarning() {
    if (violationSyncFailed || violationPending) return

    setViolationWarning('')
    violationIncidentRef.current = false
    violationIncidentIdRef.current = ''

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => {
        fullscreenActiveRef.current = true
      }).catch(() => {
        fullscreenActiveRef.current = false
      })
    }
  }


  function startAgain() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
    fullscreenActiveRef.current = false
    setCode('')
    setSessionId('')
    setChallenge(null)
    setSymbolChallenge(null)
    symbolLocationRef.current = null
    setSelectedSymbols(['', '', ''])
    setSymbolSecondsLeft(0)
    setViolationWarning('')
    setViolationCount(0)
    setViolationSyncFailed(false)
    setViolationPending(false)
    setSecurityLocked(false)
    violationIncidentRef.current = false
    violationIncidentIdRef.current = ''
    fullscreenActiveRef.current = false
    setLocationMessage('')
    setError('')
    setSuccess('')
    setStage('code')
    navigate('/student/attendance', { replace: true })
  }

  return (
    <main className={`student-attendance-page${stage === 'symbols' ? ' is-symbol-stage' : stage === 'waiting' ? ' is-waiting-stage' : ''}`}>
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

        {error && stage !== 'waiting' && (
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

        {stage === 'roll' && challenge && (
          <section className="student-panel">
            <div className="student-verified-label"><CheckCircle2 size={17} /> Code verified</div>
            <h2>Student details and campus verification</h2>
            <p className="student-panel-copy">
              Enter your registered details first. AttendX will verify your campus location before showing the classroom symbols.
            </p>
            <form onSubmit={startSymbolChallenge}>
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" name="fullName" value={form.fullName} onChange={updateField} autoComplete="name" minLength={2} maxLength={120} required />

              <div className="student-form-grid">
                <div>
                  <label htmlFor="classRollNumber">Class roll number</label>
                  <input id="classRollNumber" name="classRollNumber" value={form.classRollNumber} onChange={updateField} maxLength={50} required />
                </div>
                <div>
                  <label htmlFor="universityRollNumber">University roll number</label>
                  <input id="universityRollNumber" name="universityRollNumber" value={form.universityRollNumber} onChange={updateField} maxLength={80} autoComplete="off" required />
                </div>
              </div>

              <label htmlFor="section">Section</label>
              {challenge.sections.length > 0 ? (
                <select id="section" name="section" value={form.section} onChange={updateField} required>
                  <option value="" disabled>Select your section</option>
                  {challenge.sections.map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              ) : (
                <input id="section" name="section" value={form.section} onChange={updateField} placeholder="Enter your section" maxLength={50} required />
              )}

              <div className="student-location-box">
                <div className="student-location-heading">
                  <MapPin size={20} />
                  <div>
                    <strong>Campus location check</strong>
                    <p>Your current location is checked against the active campus geofence zones.</p>
                  </div>
                </div>
                {locationMessage && <p className="student-location-message">{locationMessage}</p>}
              </div>
              <button className="student-primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="student-spin" size={18} /> : <ShieldCheck size={18} />}
                {busy ? 'Checking campus…' : 'Verify Details and Campus'}
              </button>
              <button className="student-text-button" type="button" onClick={() => { setChallenge(null); setStage('code'); setError('') }}>
                Use a different code
              </button>
            </form>
          </section>
        )}

        {stage === 'saving-confirmed' && (
          <section className="student-panel">
            <div className="student-panel-icon"><LoaderCircle className="student-spin" size={23} /></div>
            <h2>Attendance saved</h2>
            <p className="student-panel-copy">
              The server has confirmed your attendance record. Please wait for the 15-second verification window to finish.
            </p>
          </section>
        )}

        {stage === 'waiting' && challenge && (
          <button
            className="student-waiting-refresh-button"
            type="button"
            onClick={refreshSymbolChallenge}
            disabled={busy}
            aria-label="Refresh symbol challenge"
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        )}

        {stage === 'symbols' && symbolChallenge && (
          <section className="student-panel student-symbol-stage-panel">
            {violationWarning && (
              <div className="student-symbol-warning" role="alert" aria-live="assertive">
                <strong>{violationSyncFailed ? 'Security check unavailable' : 'Security warning'}</strong>
                <p>{violationWarning}</p>
                {violationCount > 0 && <p>Recorded violations: {violationCount} of 2</p>}
                {violationSyncFailed ? (
                  <button type="button" className="student-primary-button" onClick={retrySecurityViolation} disabled={violationPending}>
                    {violationPending ? 'Retrying security check…' : 'Retry security check'}
                  </button>
                ) : (
                  <button type="button" className="student-primary-button" onClick={continueAfterWarning} disabled={violationPending}>
                    {violationPending ? 'Recording security event…' : 'Return to verification'}
                  </button>
                )}
              </div>
            )}
            <div className="student-verified-label"><CheckCircle2 size={17} /> Campus location verified</div>
            <h2>Classroom symbol verification</h2>
            <p className="student-panel-copy">
              Select exactly one symbol from each row. Complete all three selections before the timer expires.
            </p>
            <div className="student-symbol-timer" role="timer" aria-live="off">
              Time remaining: <strong>{symbolSecondsLeft}s</strong>
            </div>
            <form onSubmit={verifySymbols}>
              <div className="student-symbol-grid">
                {symbolChallenge.symbols.map((row, rowIndex) => (
                  <div className="student-symbol-row" key={`symbol-row-${rowIndex}`}>
                    {row.map((symbol) => (
                      <button
                        className={`student-symbol-option${selectedSymbols[rowIndex] === symbol ? ' is-selected' : ''}`}
                        type="button"
                        key={`${rowIndex}-${symbol}`}
                        onClick={() => {
                          setSelectedSymbols((current) =>
                            current.map((value, index) => index === rowIndex ? symbol : value),
                          )
                        }}
                        disabled={busy || symbolSecondsLeft <= 0 || Boolean(violationWarning)}
                        aria-pressed={selectedSymbols[rowIndex] === symbol}
                        aria-label={`Row ${rowIndex + 1}: ${symbol}`}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <button className="student-primary-button" type="submit" disabled={busy || symbolSecondsLeft <= 0 || Boolean(violationWarning) || selectedSymbols.some((symbol) => !symbol)}>
                {busy ? <LoaderCircle className="student-spin" size={18} /> : <ShieldCheck size={18} />}
                {busy ? 'Verifying symbols…' : 'Verify Symbols'}
              </button>
            </form>
          </section>
        )}

        {stage === 'locked' && (
          <section className="student-panel student-success-panel">
            <div className="student-success-icon"><LockKeyhole size={34} /></div>
            <h2>{securityLocked ? 'Attendance verification locked' : 'Attendance already marked'}</h2>
            <p>{success || 'Your attendance has already been marked for this session.'}</p>
            <p className="student-success-detail">
              {securityLocked ? 'This device cannot continue attendance verification for this session.' : 'This session is locked for you. Scanning the QR code again will not create another attendance record.'}
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