import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminProfile from './AdminProfile.jsx'
import TeacherManagement from './TeacherManagement.jsx'
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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [admin, setAdmin] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [teachers, setTeachers] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(emptyForm)

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

        setAdmin(result.user)
      } catch {
        if (!cancelled) setProfileError('Unable to connect to the AttendX server.')
      }
    }

    loadAdminProfile()
    return () => {
      cancelled = true
    }
  }, [navigate])

  useEffect(() => {
    return () => {
      if (admin?.photoUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(admin.photoUrl)
      }
    }
  }, [admin?.photoUrl])


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

  async function handleProfileSave(profile) {
    setAdmin((current) => ({
      ...(current || {}),
      name: profile.name,
      email: profile.email || current?.email || '',
      photoUrl: profile.photoUrl || '',
      // The selected file remains in UI state only until backend image storage is connected.
      pendingPhotoFile: profile.photoFile || null,
    }))
    setShowProfile(false)
    notify('Profile preview updated. Permanent saving will be connected to the backend next.', 'info')
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

  function handleCreateTeacher(teacherData) {
    const email = String(teacherData.email || '').trim().toLowerCase()
    const phone = String(teacherData.phone || '').trim()

    if (teachers.some((teacher) => teacher.email.toLowerCase() === email)) {
      throw new Error('This email is already in the current preview list.')
    }
    if (teachers.some((teacher) => teacher.phone === phone)) {
      throw new Error('This phone number is already in the current preview list.')
    }

    // Frontend preview only. The backend will create the real account later.
    const teacher = {
      ...teacherData,
      fullName: String(teacherData.fullName || '').trim(),
      age: Number(teacherData.age),
      email,
      phone,
      teacherId: `TCH-${String(teachers.length + 1).padStart(4, '0')}`,
      status: 'ACTIVE',
    }

    setTeachers((current) => [...current, teacher])
    notify('Teacher added to the frontend preview. It is not saved to the database yet.', 'info')
  }

  function handleCreateSubmit(event) {
    event.preventDefault()
    try {
      handleCreateTeacher(form)
      setShowCreateModal(false)
      setForm({ ...emptyForm })
    } catch (error) {
      notify(error.message || 'Unable to add teacher.', 'error')
    }
  }

  function toggleStatus(teacherId) {
    setTeachers((current) =>
      current.map((teacher) =>
        teacher.teacherId === teacherId
          ? { ...teacher, status: teacher.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE' }
          : teacher
      )
    )
    notify('Preview status changed only. Backend is not connected yet.', 'info')
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
              {item.id === 'teachers' && (
                <span className="admin-nav-count">{teachers.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <button
            className="admin-sidebar-profile-button"
            type="button"
            onClick={() => setShowProfile(true)}
            aria-label="Edit Admin profile"
          >
            <span className="admin-avatar">
              {adminPhoto ? <img src={adminPhoto} alt="" /> : adminInitials}
            </span>
            <span className="admin-profile-copy">
              <strong>{adminName}</strong>
              <small>{adminEmail || 'Admin account'}</small>
            </span>
          </button>

          <button
            className="admin-logout-button"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
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
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false)
                      setShowProfile(true)
                    }}
                  >
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
                <StatCard icon="♙" tone="purple" tag="Accounts" label="Total teachers" value={teachers.length} foot="Teacher entries in this preview" />
                <StatCard icon="✓" tone="green" tag="Active" label="Active teachers" value={activeCount} foot="Active entries in this preview" />
                <StatCard icon="Ⅱ" tone="amber" tag="Inactive" label="Inactive teachers" value={inactiveCount} foot="Deactivated entries in this preview" />
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
                {teachers.length === 0 ? (
                  <EmptyState
                    title="No teachers added yet"
                    description="Create the first teacher entry to preview the management screen."
                    action={<button className="admin-primary-button" type="button" onClick={openCreateTeacher}><span className="button-plus">＋</span> Create teacher</button>}
                  />
                ) : (
                  <TeacherTable teachers={teachers.slice(0, 5)} onToggleStatus={toggleStatus} />
                )}
              </section>
            </>
          ) : (
            <TeacherManagement
              teachers={teachers}
              onCreateTeacher={handleCreateTeacher}
              onToggleStatus={toggleStatus}
            />
          )}

          <footer className="admin-footer">
            <span>© {new Date().getFullYear()} AttendX</span>
            <span>Smart attendance management</span>
          </footer>
        </div>
      </main>

      {showCreateModal && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowCreateModal(false)
          }}
        >
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-teacher-title">
            <div className="admin-modal-header">
              <div>
                <p className="admin-eyebrow">TEACHER DIRECTORY</p>
                <h2 id="create-teacher-title">Add new teacher</h2>
                <p>Enter the teacher's details in this frontend preview.</p>
              </div>
              <button className="admin-modal-close" type="button" onClick={() => setShowCreateModal(false)} aria-label="Close dialog">×</button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="admin-form-grid">
                <label className="admin-field full">
                  <span>Full name <b>*</b></span>
                  <input name="fullName" value={form.fullName} onChange={updateForm} required minLength={2} maxLength={120} placeholder="Enter full name" />
                </label>
                <label className="admin-field">
                  <span>Email address <b>*</b></span>
                  <input name="email" type="email" value={form.email} onChange={updateForm} required maxLength={254} placeholder="teacher@example.com" />
                </label>
                <label className="admin-field">
                  <span>Phone number <b>*</b></span>
                  <input name="phone" type="tel" value={form.phone} onChange={updateForm} required maxLength={20} placeholder="Enter phone number" />
                </label>
                <label className="admin-field">
                  <span>Age <b>*</b></span>
                  <input name="age" type="number" value={form.age} onChange={updateForm} required min={18} max={100} placeholder="Age" />
                </label>
                <label className="admin-field">
                  <span>Gender <b>*</b></span>
                  <select name="gender" value={form.gender} onChange={updateForm} required>
                    <option value="">Select gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                    <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                  </select>
                </label>
                <label className="admin-field full">
                  <span>Highest qualification <b>*</b></span>
                  <input name="highestQualification" value={form.highestQualification} onChange={updateForm} required maxLength={120} placeholder="e.g. M.Tech, MCA, PhD" />
                </label>
                <label className="admin-field full">
                  <span>Address <b>*</b></span>
                  <textarea name="address" value={form.address} onChange={updateForm} required maxLength={500} rows={3} placeholder="Enter full address" />
                </label>
              </div>

              <div className="admin-form-note">
                <span>ⓘ</span>
                Frontend preview only. Real account creation, duplicate checks and temporary-password generation will be connected to the backend next.
              </div>
              <div className="admin-modal-actions">
                <button className="admin-secondary-button" type="button" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className="admin-primary-button" type="submit">Save preview</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showProfile && (
        <AdminProfile
          admin={{
            ...admin,
            name: admin?.name || admin?.fullName || adminName,
            email: adminEmail,
            photoUrl: adminPhoto,
          }}
          onClose={() => setShowProfile(false)}
          onSave={handleProfileSave}
        />
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

function TeacherTable({ teachers, onToggleStatus }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-teacher-table">
        <thead>
          <tr><th>Teacher</th><th>Teacher ID</th><th>Contact</th><th>Status</th><th className="table-action-heading">Action</th></tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr key={teacher.teacherId}>
              <td>
                <div className="admin-teacher-person">
                  <span className="admin-teacher-avatar">{teacher.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
                  <span><strong>{teacher.fullName}</strong><small>{teacher.highestQualification}</small></span>
                </div>
              </td>
              <td><span className="admin-teacher-id">{teacher.teacherId}</span></td>
              <td><span className="admin-contact-email">{teacher.email}</span><small className="admin-contact-phone">{teacher.phone}</small></td>
              <td><span className={`admin-status-pill ${teacher.status === 'ACTIVE' ? 'active' : 'inactive'}`}><i />{teacher.status === 'ACTIVE' ? 'Active' : 'Deactivated'}</span></td>
              <td className="table-action-cell">
                <button className="admin-row-action" type="button" onClick={() => onToggleStatus(teacher.teacherId)}>
                  {teacher.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}