import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminProfile from './AdminProfile.jsx'
import './AdminDashboard.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const navigation = [
  { id: 'overview', label: 'Dashboard', icon: '▦' },
  { id: 'teachers', label: 'Teachers', icon: '♙' },
]

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  age: '',
  gender: '',
  highestQualification: '',
  address: '',
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [activePage, setActivePage] = useState('overview')
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [admin, setAdmin] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [teachers, setTeachers] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false)
  const [isSavingTeacher, setIsSavingTeacher] = useState(false)
  const [resettingTeacherId, setResettingTeacherId] = useState(null)
  const [resetConfirmationTeacher, setResetConfirmationTeacher] = useState(null)
  const [credentials, setCredentials] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadAdminProfile() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/admin/me`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        const result = await response.json().catch(() => ({}))

        if (cancelled) return

        if (response.status === 401 || response.status === 403) {
          navigate('/admin/login', { replace: true })
          return
        }

        if (!response.ok || !result.success || result.user?.role !== 'ADMIN') {
          setProfileError('Admin profile could not be loaded.')
          return
        }

        setAdmin((current) => ({
          ...result.user,
          name: current?.name || result.user?.name || result.user?.fullName || '',
          photoUrl: current?.photoUrl || result.user?.photoUrl || result.user?.avatarUrl || '',
        }))
      } catch {
        if (!cancelled) setProfileError('Unable to connect to the AttendX server.')
      }
    }

    loadAdminProfile()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function loadTeachers() {
    setIsLoadingTeachers(true)
    try {
      const allTeachers = []
      let page = 1
      let totalPages = 1
      do {
        const response = await fetch(`${API_BASE_URL}/api/admin/teachers?page=${page}&limit=100`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        })
        const result = await response.json().catch(() => ({}))
        if (response.status === 401 || response.status === 403) {
          navigate('/admin/login', { replace: true })
          return
        }
        if (!response.ok || !result.success || !Array.isArray(result.teachers)) {
          throw new Error(result.message || 'Teacher list could not be loaded.')
        }
        allTeachers.push(...result.teachers)
        totalPages = Math.max(1, Number(result.pagination?.totalPages) || 1)
        page += 1
      } while (page <= totalPages)
      setTeachers(allTeachers)
    } catch (error) {
      const message = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'Teacher list request timed out. Check that the backend is running and /api/admin/teachers responds.'
        : (error.message || 'Unable to load teachers. Check the backend terminal for details.')
      notify(message, 'error')
    } finally {
      setIsLoadingTeachers(false)
    }
  }

  useEffect(() => {
    loadTeachers()
    // Load persisted teacher records once when the dashboard mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (admin?.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(admin.photoUrl)
    }
  }, [admin?.photoUrl])

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return teachers
    return teachers.filter((teacher) =>
      [teacher.teacherId, teacher.fullName, teacher.email, teacher.phone]
        .some((value) => String(value || '').toLowerCase().includes(query))
    )
  }, [teachers, search])

  const activeCount = teachers.filter((teacher) => teacher.status === 'ACTIVE').length
  const inactiveCount = teachers.length - activeCount
  const adminName = admin?.name || admin?.fullName || 'Administrator'
  const adminEmail = admin?.email || ''
  const adminPhoto = admin?.photoUrl || admin?.avatarUrl || ''
  const adminInitials = adminName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'AD'

  function notify(message, type = 'success') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3200)
  }

  function openCreateTeacher() {
    setForm({ ...emptyForm })
    setShowCreateModal(true)
  }

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/admin/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        notify(result.message || 'Logout failed. Please try again.', 'error')
        setIsLoggingOut(false)
        return
      }

      navigate('/admin/login', { replace: true })
    } catch {
      notify('Unable to contact the server. Logout could not be confirmed.', 'error')
      setIsLoggingOut(false)
    }
  }

  async function handleProfileSave(profile) {
    const name = profile.name.trim()

    // Save the Admin's display name through the authenticated session.
    const profileResponse = await fetch(`${API_BASE_URL}/api/auth/admin/profile`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    })

    const profileResult = await profileResponse.json().catch(() => ({}))

    if (!profileResponse.ok || !profileResult.success || !profileResult.user) {
      throw new Error(profileResult.message || 'Admin name could not be saved.')
    }

    let savedUser = profileResult.user

    // Upload the selected image only when a new file was selected.
    if (profile.photoFile) {
      const formData = new FormData()
      formData.append('photo', profile.photoFile)

      const photoResponse = await fetch(`${API_BASE_URL}/api/admin/uploads/profile-photo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const photoResult = await photoResponse.json().catch(() => ({}))

      if (!photoResponse.ok || !photoResult.success || !photoResult.admin) {
        throw new Error(photoResult.message || 'Profile photo could not be uploaded.')
      }

      savedUser = {
        ...savedUser,
        ...photoResult.admin,
        name: photoResult.admin.name || savedUser.name,
        fullName: photoResult.admin.name || savedUser.fullName,
        photoUrl: photoResult.admin.photoUrl || photoResult.photo?.url || savedUser.photoUrl || '',
        role: 'ADMIN',
      }
    }

    setAdmin((current) => ({
      ...(current || {}),
      ...savedUser,
      name: savedUser.name || savedUser.fullName || name,
      fullName: savedUser.fullName || savedUser.name || name,
      email: savedUser.email || profile.email || current?.email || '',
      photoUrl: savedUser.photoUrl || '',
      role: 'ADMIN',
    }))

    setShowProfile(false)
    notify('Admin profile saved successfully.', 'success')
  }

  async function handleCreateSubmit(event) {
    event.preventDefault()
    if (isSavingTeacher) return
    setIsSavingTeacher(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/teachers`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          age: Number(form.age),
          highestQualification: form.highestQualification.trim(),
          address: form.address.trim(),
        }),
      })
      const result = await response.json().catch(() => ({}))

      if (response.status === 401 || response.status === 403) {
        navigate('/admin/login', { replace: true })
        return
      }
      if (!response.ok || !result.success || !result.teacher || !result.credentials?.temporaryPassword) {
        throw new Error(result.message || 'Teacher account could not be created.')
      }

      setShowCreateModal(false)
      setForm({ ...emptyForm })
      setCredentials({
        title: 'Teacher account created',
        teacherName: result.teacher.fullName,
        teacherId: result.teacher.teacherId,
        email: result.teacher.email,
        temporaryPassword: result.credentials.temporaryPassword,
      })
      await loadTeachers()
      notify('Teacher account created successfully.', 'success')
    } catch (error) {
      notify(error.message || 'Unable to create teacher account.', 'error')
    } finally {
      setIsSavingTeacher(false)
    }
  }

  async function toggleStatus(teacher) {
    const nextStatus = teacher.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE'
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/teachers/${encodeURIComponent(teacher.id)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const result = await response.json().catch(() => ({}))
      if (response.status === 401 || response.status === 403) {
        navigate('/admin/login', { replace: true })
        return
      }
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Teacher status could not be updated.')
      }
      await loadTeachers()
      notify(`Teacher ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`, 'success')
    } catch (error) {
      notify(error.message || 'Unable to update teacher status.', 'error')
    }
  }

  async function resetTeacherPassword(teacher) {
    if (resettingTeacherId) return
    setResetConfirmationTeacher(teacher)
  }

  async function confirmResetTeacherPassword() {
    const teacher = resetConfirmationTeacher
    if (!teacher || resettingTeacherId) return

    setResetConfirmationTeacher(null)
    setResettingTeacherId(teacher.id)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/teachers/${encodeURIComponent(teacher.id)}/reset-password`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      )
      const result = await response.json().catch(() => ({}))

      if (response.status === 401 || response.status === 403) {
        navigate('/admin/login', { replace: true })
        return
      }
      if (!response.ok || !result.success || !result.credentials?.temporaryPassword) {
        throw new Error(result.message || 'Teacher password could not be reset.')
      }

      await loadTeachers()
      setCredentials({
        title: 'Temporary password reset',
        teacherName: teacher.fullName,
        teacherId: teacher.teacherId,
        email: teacher.email,
        temporaryPassword: result.credentials.temporaryPassword,
      })
    } catch (error) {
      notify(error.message || 'Unable to reset teacher password.', 'error')
    } finally {
      setResettingTeacherId(null)
    }
  }

  function updateForm(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  return (
    <div className="attendx-admin">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">A</div>
          <div>
            <div className="admin-brand-name">AttendX</div>
            <div className="admin-brand-caption">SMART ATTENDANCE</div>
          </div>
        </div>

        <div className="admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navigation.map((item) => (
            <button
              className={`admin-nav-item ${activePage === item.id ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'teachers' && <span className="admin-nav-count">{teachers.length}</span>}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <button className="admin-sidebar-profile-button" type="button" onClick={() => setShowProfile(true)}>
            <span className="admin-avatar">
              {adminPhoto ? <img src={adminPhoto} alt="" /> : adminInitials}
            </span>
            <span className="admin-profile-copy">
              <strong>{adminName}</strong>
              <small>{adminEmail || 'Admin account'}</small>
            </span>
          </button>

          <button className="admin-logout-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>
            <span aria-hidden="true">↪</span>
            {isLoggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            <span>AttendX</span><span className="breadcrumb-slash">/</span>
            <strong>{activePage === 'overview' ? 'Dashboard' : 'Teacher Management'}</strong>
          </div>

          <div className="admin-topbar-right">
            <span className="admin-status-dot" />
            <span className="admin-status-label">Workspace</span>
            <span className="admin-topbar-divider" />
            <div className="admin-profile-menu-wrap">
              <button
                className="admin-topbar-avatar"
                type="button"
                aria-label="Open Admin profile menu"
                aria-expanded={showProfileMenu}
                onClick={() => setShowProfileMenu((shown) => !shown)}
              >
                {adminPhoto ? <img src={adminPhoto} alt="" /> : adminInitials}
              </button>

              {showProfileMenu && (
                <div className="admin-profile-menu">
                  <strong>{adminName}</strong>
                  <small>{adminEmail || 'Admin account'}</small>
                  {profileError && <small role="status">{profileError}</small>}
                  <button type="button" onClick={() => { setShowProfileMenu(false); setShowProfile(true) }}>
                    Profile settings
                  </button>
                  <button type="button" onClick={handleLogout} disabled={isLoggingOut}>
                    {isLoggingOut ? 'Logging out…' : 'Log out'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="admin-content">
          {activePage === 'overview' ? (
            <>
              <section className="admin-welcome-row">
                <div>
                  <p className="admin-eyebrow">ADMINISTRATOR WORKSPACE</p>
                  <h1>Dashboard overview</h1>
                  <p className="admin-subtitle">Manage teacher accounts from one simple workspace.</p>
                </div>
                <button className="admin-primary-button" type="button" onClick={openCreateTeacher}>
                  <span className="button-plus">＋</span> Add teacher
                </button>
              </section>

              <section className="admin-stat-grid" aria-label="Teacher statistics">
                <StatCard icon="♙" tone="purple" tag="Accounts" label="Total teachers" value={teachers.length} foot="Saved teacher accounts" />
                <StatCard icon="✓" tone="green" tag="Active" label="Active teachers" value={activeCount} foot="Currently active accounts" />
                <StatCard icon="Ⅱ" tone="amber" tag="Inactive" label="Deactivated teachers" value={inactiveCount} foot="Non-active accounts" />
              </section>

              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Teacher management</h2>
                    <p>Create and maintain teacher accounts.</p>
                  </div>
                  <button className="admin-text-button" type="button" onClick={() => setActivePage('teachers')}>
                    View all teachers <span>→</span>
                  </button>
                </div>
                {isLoadingTeachers ? <div className="admin-loading-state" role="status"><span className="admin-loading-spinner" aria-hidden="true" />Loading teachers…</div> : teachers.length === 0 ? (
                  <EmptyState
                    title="No teachers added yet"
                    description="Create the first Teacher account to get started."
                    action={<button className="admin-primary-button" type="button" onClick={openCreateTeacher}><span className="button-plus">＋</span> Create teacher</button>}
                  />
                ) : (
                  <TeacherTable teachers={teachers.slice(0, 5)} onToggleStatus={toggleStatus} onResetPassword={resetTeacherPassword} resettingTeacherId={resettingTeacherId} />
                )}
              </section>
            </>
          ) : (
            <>
              <section className="admin-welcome-row">
                <div>
                  <p className="admin-eyebrow">ACCOUNT DIRECTORY</p>
                  <h1>Teacher management</h1>
                  <p className="admin-subtitle">Search saved Teacher accounts and manage their status.</p>
                </div>
                <button className="admin-primary-button" type="button" onClick={openCreateTeacher}>
                  <span className="button-plus">＋</span> Add teacher
                </button>
              </section>

              <section className="admin-panel">
                <div className="admin-teacher-toolbar">
                  <div>
                    <h2>All teachers <span className="admin-heading-count">{teachers.length}</span></h2>
                    <p>Search by Teacher ID, name, email or phone.</p>
                  </div>
                  <label className="admin-search-box">
                    <span aria-hidden="true">⌕</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teachers..." aria-label="Search teachers" />
                    {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button>}
                  </label>
                </div>
                {isLoadingTeachers ? <div className="admin-loading-state" role="status"><span className="admin-loading-spinner" aria-hidden="true" />Loading teachers…</div> : filteredTeachers.length === 0 ? (
                  <EmptyState
                    compact
                    title={search ? 'No matching teachers found' : 'No teachers added yet'}
                    description={search ? 'Try a different name, email, phone number or Teacher ID.' : 'Add a teacher entry to see it listed here.'}
                    action={!search ? <button className="admin-primary-button" type="button" onClick={openCreateTeacher}>＋ Add teacher</button> : null}
                  />
                ) : (
                  <TeacherTable teachers={filteredTeachers} onToggleStatus={toggleStatus} onResetPassword={resetTeacherPassword} resettingTeacherId={resettingTeacherId} />
                )}
              </section>
            </>
          )}

          <footer className="admin-footer">
            <span>© {new Date().getFullYear()} AttendX</span>
            <span>Smart attendance management</span>
          </footer>
        </div>
      </main>

      {showCreateModal && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowCreateModal(false)
        }}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-teacher-title">
            <div className="admin-modal-header">
              <div>
                <p className="admin-eyebrow">TEACHER DIRECTORY</p>
                <h2 id="create-teacher-title">Add new teacher</h2>
                <p>Create a real Teacher account and generate a one-time temporary password.</p>
              </div>
              <button className="admin-modal-close" type="button" onClick={() => setShowCreateModal(false)} aria-label="Close dialog">×</button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="admin-form-grid">
                <label className="admin-field full"><span>Full name <b>*</b></span><input name="fullName" value={form.fullName} onChange={updateForm} required minLength={2} maxLength={120} placeholder="Enter full name" /></label>
                <label className="admin-field"><span>Email address <b>*</b></span><input name="email" type="email" value={form.email} onChange={updateForm} required maxLength={254} placeholder="teacher@example.com" /></label>
                <label className="admin-field"><span>Phone number <b>*</b></span><input name="phone" type="tel" value={form.phone} onChange={updateForm} required maxLength={20} placeholder="Enter phone number" /></label>
                <label className="admin-field"><span>Age <b>*</b></span><input name="age" type="number" value={form.age} onChange={updateForm} required min={18} max={100} placeholder="Age" /></label>
                <label className="admin-field"><span>Gender <b>*</b></span><select name="gender" value={form.gender} onChange={updateForm} required><option value="">Select gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option><option value="PREFER_NOT_TO_SAY">Prefer not to say</option></select></label>
                <label className="admin-field full"><span>Highest qualification <b>*</b></span><input name="highestQualification" value={form.highestQualification} onChange={updateForm} required maxLength={120} placeholder="e.g. M.Tech, MCA, PhD" /></label>
                <label className="admin-field full"><span>Address <b>*</b></span><textarea name="address" value={form.address} onChange={updateForm} required maxLength={500} rows={3} placeholder="Enter full address" /></label>
              </div>
              <div className="admin-form-note"><span>ⓘ</span> A temporary password will be shown once after account creation. Share it securely with the teacher.</div>
              <div className="admin-modal-actions">
                <button className="admin-secondary-button" type="button" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className="admin-primary-button" type="submit" disabled={isSavingTeacher}>{isSavingTeacher ? 'Creating…' : 'Create account'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showProfile && (
        <AdminProfile
          admin={{ ...admin, name: adminName, email: adminEmail, photoUrl: adminPhoto }}
          onClose={() => setShowProfile(false)}
          onSave={handleProfileSave}
        />
      )}

      {resetConfirmationTeacher && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
            <div className="admin-modal-header">
              <div>
                <p className="admin-eyebrow">PASSWORD RESET</p>
                <h2 id="reset-confirm-title">Reset teacher password?</h2>
                <p>Generate a new temporary password for <strong>{resetConfirmationTeacher.fullName}</strong>? Their current password will stop working.</p>
              </div>
              <button className="admin-modal-close" type="button" onClick={() => setResetConfirmationTeacher(null)} aria-label="Cancel password reset">×</button>
            </div>
            <div className="admin-form-note"><span>ⓘ</span> The new temporary password will be shown once. The teacher must change it after signing in.</div>
            <div className="admin-modal-actions admin-confirm-actions">
              <button className="admin-secondary-button" type="button" onClick={() => setResetConfirmationTeacher(null)}>Cancel</button>
              <button className="admin-primary-button" type="button" onClick={confirmResetTeacherPassword} disabled={Boolean(resettingTeacherId)}>Reset password</button>
            </div>
          </section>
        </div>
      )}

      {credentials && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-credentials-title">
            <div className="admin-modal-header">
              <div>
                <p className="admin-eyebrow">SHOW ONCE</p>
                <h2 id="teacher-credentials-title">{credentials.title}</h2>
                <p>Share these details securely with the teacher. Do not store the temporary password in notes or screenshots.</p>
              </div>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field full"><span>Teacher name</span><input value={credentials.teacherName} readOnly /></label>
              <label className="admin-field"><span>Teacher ID</span><input value={credentials.teacherId} readOnly /></label>
              <label className="admin-field"><span>Email</span><input value={credentials.email} readOnly /></label>
              <label className="admin-field full"><span>Temporary password</span><input value={credentials.temporaryPassword} readOnly autoComplete="off" /></label>
            </div>
            <div className="admin-form-note"><span>ⓘ</span> The teacher must change this password after first login. Closing this window means the password will not be shown again; reset it if it is lost.</div>
            <div className="admin-modal-actions">
              <button className="admin-secondary-button" type="button" onClick={() => { navigator.clipboard?.writeText(`Teacher: ${credentials.teacherName}\nTeacher ID: ${credentials.teacherId}\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}`).then(() => notify('Credentials copied. Share them securely.', 'success')).catch(() => notify('Copy failed. Please copy the details manually.', 'error')) }}>Copy details</button>
              <button className="admin-primary-button" type="button" onClick={() => setCredentials(null)}>Done</button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className={`admin-toast ${toast.type}`} role="status" aria-live="polite">
          <span className="admin-toast-icon">{toast.type === 'error' ? '!' : toast.type === 'info' ? 'i' : '✓'}</span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, tone, tag, label, value, foot }) {
  return (
    <article className="admin-stat-card">
      <div className="admin-stat-top">
        <span className={`admin-stat-icon ${tone}`}>{icon}</span>
        <span className={`admin-stat-tag ${tone === 'green' ? 'positive' : tone === 'amber' ? 'neutral' : ''}`}>{tag}</span>
      </div>
      <p className="admin-stat-label">{label}</p>
      <div className="admin-stat-value">{value}</div>
      <p className="admin-stat-foot">{foot}</p>
    </article>
  )
}

function EmptyState({ title, description, action, compact = false }) {
  return (
    <div className={`admin-empty-state ${compact ? 'compact' : ''}`}>
      <div className="admin-empty-illustration"><span>{compact ? '⌕' : '♙'}</span>{!compact && <i>＋</i>}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

function TeacherTable({ teachers, onToggleStatus, onResetPassword, resettingTeacherId }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-teacher-table">
        <thead><tr><th>Teacher</th><th>Teacher ID</th><th>Contact</th><th>Status</th><th className="table-action-heading">Actions</th></tr></thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr key={teacher.id || teacher.teacherId}>
              <td><div className="admin-teacher-person"><span className="admin-teacher-avatar">{teacher.photoUrl ? <img src={teacher.photoUrl} alt="" /> : String(teacher.fullName || 'T').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{teacher.fullName}</strong><small>{teacher.highestQualification}</small></span></div></td>
              <td><span className="admin-teacher-id">{teacher.teacherId}</span></td>
              <td><span className="admin-contact-email">{teacher.email}</span><small className="admin-contact-phone">{teacher.phone}</small></td>
              <td><span className={`admin-status-pill ${teacher.status === 'ACTIVE' ? 'active' : 'inactive'}`}><i />{teacher.status === 'ACTIVE' ? 'Active' : teacher.status}</span></td>
              <td className="table-action-cell">
                <button className="admin-row-action" type="button" onClick={() => onToggleStatus(teacher)}>{teacher.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                <button className="admin-row-action" type="button" onClick={() => onResetPassword(teacher)} disabled={teacher.status !== 'ACTIVE' || teacher.id === resettingTeacherId}>{teacher.id === resettingTeacherId ? 'Resetting…' : 'Reset password'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
