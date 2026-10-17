
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  X,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import './AdminLogin.css'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ''
).replace(/\/$/, '')

async function postJson(path, payload) {
  if (!API_BASE_URL) {
    throw new Error(
      'Backend is not configured yet. Please try again after setup.'
    )
  }

  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Unable to connect to AttendX server.')
  }

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result.message || 'Request failed. Please try again.')
  }

  return result
}

const viewContent = {
  login: {
    eyebrow: 'ADMINISTRATOR PORTAL',
    title: 'Welcome back',
    description: 'Sign in with your administrator account.',
  },
  register: {
    eyebrow: 'RESTRICTED REGISTRATION',
    title: 'Create admin account',
    description: 'Registration is limited to the email authorized by the server.',
  },
  forgot: {
    eyebrow: 'ACCOUNT RECOVERY',
    title: 'Forgot password?',
    description: 'Request a verification code for your administrator account.',
  },
  verify: {
    eyebrow: 'EMAIL VERIFICATION',
    title: 'Verify your email',
    description: 'Enter the one-time code sent to your email address.',
  },
  reset: {
    eyebrow: 'SECURE YOUR ACCOUNT',
    title: 'Set new password',
    description: 'Choose a strong new password for your account.',
  },
}

function AdminLogin() {
  const [view, setView] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const toastTimer = useRef(null)
  const navigate = useNavigate()
  const current = viewContent[view]

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current)
  }, [])

  function notify(type, message) {
    window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), type, message })

    toastTimer.current = window.setTimeout(() => {
      setToast(null)
    }, 5000)
  }

  function changeView(nextView) {
    setView(nextView)
    setToast(null)
    setPassword('')
    setConfirmPassword('')
    setOtp('')
    setResetToken('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  async function handleLogin(event) {
    event.preventDefault()

    if (!email.trim() || !password) {
      notify('error', 'Enter your admin email and password.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await postJson('/api/auth/admin/login', {
        email: email.trim().toLowerCase(),
        password,
      })

      if (result.user?.role !== 'ADMIN') {
        notify('error', 'This account does not have administrator access.')
        return
      }

      notify('success', 'Login successful. Opening dashboard…')
      window.setTimeout(() => navigate('/admin/dashboard'), 650)
    } catch (error) {
      notify('error', error.message || 'Login failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      notify('error', 'Please complete every field.')
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      notify('error', 'Please enter a valid email address.')
      return
    }

    if (password.length < 8) {
      notify('warning', 'Password must contain at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      notify('error', 'Passwords do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      await postJson('/api/auth/admin/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })

      setPassword('')
      setConfirmPassword('')
      setView('login')
      notify('success', 'Admin account created. You can now sign in.')
    } catch (error) {
      notify('error', error.message || 'Account creation failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgot(event) {
    event.preventDefault()

    if (!email.trim()) {
      notify('error', 'Enter your administrator email first.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await postJson('/api/auth/admin/forgot-password', {
        email: email.trim().toLowerCase(),
      })

      setView('verify')
      notify(
        'success',
        result.message ||
          'If the account is eligible, a verification code will be sent.'
      )
    } catch (error) {
      notify('error', error.message || 'Could not start password recovery.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()

    if (!/^\d{6}$/.test(otp.trim())) {
      notify('error', 'Enter the 6-digit verification code.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await postJson('/api/auth/admin/verify-reset-otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      })

      if (!result.resetToken) {
        throw new Error('Verification token missing. Please try again.')
      }

      setResetToken(result.resetToken)
      setPassword('')
      setConfirmPassword('')
      setView('reset')
      notify('success', 'Email verified. Set your new password.')
    } catch (error) {
      notify('error', error.message || 'Invalid or expired verification code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()

    if (password.length < 8) {
      notify('warning', 'Your new password must contain at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      notify('error', 'Passwords do not match.')
      return
    }

    if (!resetToken) {
      changeView('forgot')
      notify('error', 'Verification expired. Please verify your email again.')
      return
    }

    setIsSubmitting(true)

    try {
      await postJson('/api/auth/admin/reset-password', {
        email: email.trim().toLowerCase(),
        resetToken,
        newPassword: password,
      })

      setPassword('')
      setConfirmPassword('')
      setResetToken('')
      setView('login')
      notify('success', 'Password updated. Sign in with your new password.')
    } catch (error) {
      notify('error', error.message || 'Password could not be updated.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendOtp() {
    setIsSubmitting(true)

    try {
      const result = await postJson('/api/auth/admin/forgot-password', {
        email: email.trim().toLowerCase(),
      })

      notify(
        'success',
        result.message || 'If eligible, a new verification code has been sent.'
      )
    } catch (error) {
      notify('error', error.message || 'Could not resend the code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function renderPasswordField({
    id,
    label,
    value,
    setter,
    visible,
    setVisible,
    autocomplete,
  }) {
    return (
      <div className="admin-form-field" key={id}>
        <label htmlFor={id}>{label}</label>

        <div className="admin-input-wrap">
          <LockKeyhole size={18} aria-hidden="true" />

          <input
            id={id}
            type={visible ? 'text' : 'password'}
            name={id}
            autoComplete={autocomplete}
            placeholder={
              label.toLowerCase().includes('new password')
                ? 'At least 8 characters'
                : 'Enter your password'
            }
            value={value}
            onChange={(event) => setter(event.target.value)}
            disabled={isSubmitting}
            minLength={8}
            required
          />

          <button
            className="admin-password-toggle"
            type="button"
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            disabled={isSubmitting}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
    )
  }

  function renderSubmitButton(label, loadingLabel) {
    return (
      <button
        className="admin-login-submit"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? loadingLabel : label}
      </button>
    )
  }

  return (
    <main className="admin-login-page">
      {toast && (
        <div
          className={`admin-toast admin-toast-${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
          key={toast.id}
        >
          <span className="admin-toast-icon" aria-hidden="true">
            {toast.type === 'success' ? (
              <CheckCircle2 size={21} />
            ) : toast.type === 'info' ? (
              <Info size={21} />
            ) : (
              <AlertCircle size={21} />
            )}
          </span>

          <p>{toast.message}</p>

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}

      <header className="admin-login-topbar">
        <Link className="admin-back-home" to="/" aria-label="Back to AttendX home">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back to Home</span>
        </Link>

        <span className="admin-secure-label">
          <LockKeyhole size={14} aria-hidden="true" />
          Secure administrator access
        </span>
      </header>

      <section className="admin-login-layout" aria-labelledby="admin-login-title">
        <div className="admin-login-intro">
          <div className="admin-login-brand">
            <span className="admin-login-brand-mark">
              <ShieldCheck size={27} strokeWidth={2.1} />
            </span>

            <span className="admin-login-brand-name">
              <span className="admin-brand-word">
                Attend<span>X</span>
              </span>
              <small>SMART ATTENDANCE</small>
            </span>
          </div>

          <span className="admin-login-eyebrow">
            <span className="admin-login-eyebrow-dot" />
            {current.eyebrow}
          </span>

          <h1 id="admin-login-title">
            Keep your campus
            <br />
            <span>running smoothly.</span>
          </h1>

          <p className="admin-login-intro-copy">
            Manage teacher access, review registration requests and oversee
            attendance operations from one secure workspace.
          </p>

          <div className="admin-login-trust-list">
            <div>
              <span className="admin-trust-icon">
                <ShieldCheck size={17} />
              </span>
              <span>
                <strong>Role-protected access</strong>
                <small>Administrator permissions are verified by the server.</small>
              </span>
            </div>

            <div>
              <span className="admin-trust-icon">
                <LockKeyhole size={17} />
              </span>
              <span>
                <strong>Private account recovery</strong>
                <small>Verify your registered email before changing a password.</small>
              </span>
            </div>
          </div>
        </div>

        <div className="admin-login-card">
          <div className="admin-login-card-heading">
            <span className="admin-login-card-icon">
              {view === 'register' ? (
                <UserRound size={23} />
              ) : view === 'forgot' || view === 'verify' ? (
                <Mail size={23} />
              ) : view === 'reset' ? (
                <KeyRound size={23} />
              ) : (
                <ShieldCheck size={23} />
              )}
            </span>

            <div>
              <h2>{current.title}</h2>
              <p>{current.description}</p>
            </div>
          </div>

          {view === 'login' && (
            <form className="admin-login-form" onSubmit={handleLogin}>
              <div className="admin-form-field">
                <label htmlFor="admin-email">Administrator email</label>
                <div className="admin-input-wrap">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="admin-email"
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="admin@yourcollege.edu"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              </div>

              {renderPasswordField({
                id: 'admin-password',
                label: 'Password',
                value: password,
                setter: setPassword,
                visible: showPassword,
                setVisible: setShowPassword,
                autocomplete: 'current-password',
              })}

              <div className="admin-form-inline">
                <span>Use your authorized admin email.</span>
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() => changeView('forgot')}
                >
                  Forgot password?
                </button>
              </div>

              {renderSubmitButton('Sign in to Admin', 'Signing in…')}

              <div className="admin-register-prompt">
                <span>New administrator?</span>
                <button
                  type="button"
                  className="admin-register-cta"
                  onClick={() => changeView('register')}
                >
                  <UserRound size={17} />
                  Create Admin Account
                </button>
                <small>
                  Registration is available only for the email authorized by the server.
                </small>
              </div>
            </form>
          )}

          {view === 'register' && (
            <form className="admin-login-form" onSubmit={handleRegister}>
              <div className="admin-form-field">
                <label htmlFor="admin-name">Full name</label>
                <div className="admin-input-wrap">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    id="admin-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={isSubmitting}
                    maxLength={100}
                    required
                  />
                </div>
              </div>

              <div className="admin-form-field">
                <label htmlFor="admin-register-email">
                  Authorized administrator email
                </label>
                <div className="admin-input-wrap">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="admin-register-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter the authorized email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <small className="admin-field-note">
                  The server checks this against its ADMIN_EMAIL setting.
                </small>
              </div>

              {renderPasswordField({
                id: 'admin-register-password',
                label: 'Password',
                value: password,
                setter: setPassword,
                visible: showPassword,
                setVisible: setShowPassword,
                autocomplete: 'new-password',
              })}

              {renderPasswordField({
                id: 'admin-confirm-password',
                label: 'Confirm password',
                value: confirmPassword,
                setter: setConfirmPassword,
                visible: showConfirmPassword,
                setVisible: setShowConfirmPassword,
                autocomplete: 'new-password',
              })}

              {renderSubmitButton('Create Admin Account', 'Creating account…')}

              <p className="admin-login-help">
                Already registered?{' '}
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() => changeView('login')}
                >
                  Back to sign in
                </button>
              </p>

              <p className="admin-security-note">
                <ShieldCheck size={15} />
                Registration is restricted and validated by the backend.
              </p>
            </form>
          )}

          {view === 'forgot' && (
            <form className="admin-login-form" onSubmit={handleForgot}>
              <div className="admin-form-field">
                <label htmlFor="admin-forgot-email">Administrator email</label>
                <div className="admin-input-wrap">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="admin-forgot-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your registered admin email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              </div>

              {renderSubmitButton('Send Verification Code', 'Sending code…')}

              <p className="admin-login-help">
                For security, the server should not reveal whether an email is registered.
              </p>

              <p className="admin-login-help">
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() => changeView('login')}
                >
                  Back to sign in
                </button>
              </p>
            </form>
          )}

          {view === 'verify' && (
            <form className="admin-login-form" onSubmit={handleVerifyOtp}>
              <div className="admin-recovery-email">
                <Mail size={16} />
                <span>
                  Verification for <strong>{email}</strong>
                </span>
              </div>

              <div className="admin-form-field">
                <label htmlFor="admin-reset-otp">6-digit verification code</label>
                <div className="admin-input-wrap admin-otp-wrap">
                  <KeyRound size={18} aria-hidden="true" />
                  <input
                    id="admin-reset-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    disabled={isSubmitting}
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                  />
                </div>
                <small className="admin-field-note">
                  Enter the code from your email. It expires after a short period.
                </small>
              </div>

              {renderSubmitButton('Verify Code', 'Verifying…')}

              <div className="admin-recovery-actions">
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={handleResendOtp}
                  disabled={isSubmitting}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() => changeView('forgot')}
                >
                  Change email
                </button>
              </div>
            </form>
          )}

          {view === 'reset' && (
            <form className="admin-login-form" onSubmit={handleResetPassword}>
              {renderPasswordField({
                id: 'admin-new-password',
                label: 'New password',
                value: password,
                setter: setPassword,
                visible: showPassword,
                setVisible: setShowPassword,
                autocomplete: 'new-password',
              })}

              {renderPasswordField({
                id: 'admin-new-password-confirm',
                label: 'Confirm new password',
                value: confirmPassword,
                setter: setConfirmPassword,
                visible: showConfirmPassword,
                setVisible: setShowConfirmPassword,
                autocomplete: 'new-password',
              })}

              <small className="admin-field-note">
                Use at least 8 characters. Your old password will be replaced
                after the server confirms the reset.
              </small>

              {renderSubmitButton('Update Password', 'Updating password…')}

              <p className="admin-login-help">
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() => changeView('login')}
                >
                  Cancel and return to sign in
                </button>
              </p>
            </form>
          )}

          <div className="admin-login-card-footer">
            <LockKeyhole size={14} aria-hidden="true" />
            <span>
              Your session and administrator permissions are protected by the server.
            </span>
          </div>
        </div>
      </section>

      <footer className="admin-login-footer">
        <span>© {new Date().getFullYear()} AttendX</span>
        <span>Smart attendance, designed with care.</span>
      </footer>
    </main>
  )
}

export default AdminLogin
