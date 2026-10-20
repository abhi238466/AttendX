
import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import './TeacherDashboard.css'

import TeacherDashboardHome from "./TeacherDashboardHome";
import StartAttendance from "./StartAttendance";
import AttendanceHistory from "./AttendanceHistory";
import TeacherProfile from "./TeacherProfile";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'sessions-new', label: 'Start Attendance', icon: 'qr' },
  { id: 'sessions', label: 'Attendance History', icon: 'history' },
  { id: 'profile', label: 'My Profile', icon: 'user' },
]

function MenuIcon({ type }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    qr: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM20 14v2M17 20h4M20 18v3" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2M3 5v4h4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[type] || paths.grid}
    </svg>
  )
}

export default function TeacherDashboard() {
  const context = useOutletContext()
  const teacher = context?.teacher || {}
  const navigate = useNavigate()

  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const displayName = teacher.displayName || teacher.fullName || 'Teacher'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'T'

  async function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)
    setLogoutError('')

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/teacher/logout`,
        {
          method: 'POST',
          credentials: 'include',
        },
      )

      if (!response.ok) {
        throw new Error('Logout failed. Please try again.')
      }

      navigate('/teacher/login', { replace: true })
    } catch (error) {
      setLogoutError(
        error instanceof TypeError
          ? 'Unable to connect to the server. Please try again.'
          : error.message || 'Something went wrong during logout.',
      )
    } finally {
      setLoggingOut(false)
    }
  }

  function selectPage(id) {
    setActivePage(id)
    setSidebarOpen(false)
  }

  function renderPage() {
    switch (activePage) {
      case 'sessions-new':
        return (
          <StartAttendance
            onBack={() => selectPage('dashboard')}
          />
        )

      case 'sessions':
        return (
          <AttendanceHistory
            onBack={() => selectPage('dashboard')}
          />
        )

      case 'profile':
        return (
          <TeacherProfile
            teacher={teacher}
            onBack={() => selectPage('dashboard')}
          />
        )

      case 'dashboard':
      default:
        return (
          <TeacherDashboardHome
            displayName={displayName}
            onStartAttendance={() => selectPage('sessions-new')}
            onViewHistory={() => selectPage('sessions')}
          />
        )
    }
  }

  return (
    <main className="td-app">
      {sidebarOpen && (
        <button
          className="td-sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`td-sidebar ${
          sidebarOpen ? 'td-sidebar-open' : ''
        }`}
      >
        <Link
          className="td-brand"
          to="/teacher/dashboard"
          onClick={() => selectPage('dashboard')}
        >
          Attend<span>X</span>
        </Link>

        <div className="td-sidebar-label">WORKSPACE</div>

        <nav className="td-nav" aria-label="Teacher navigation">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`td-nav-item ${
                activePage === item.id ? 'td-nav-active' : ''
              }`}
              onClick={() => selectPage(item.id)}
              aria-current={
                activePage === item.id ? 'page' : undefined
              }
            >
              <MenuIcon type={item.icon} />
              <span>{item.label}</span>

              {activePage === item.id && (
                <span className="td-nav-indicator" />
              )}
            </button>
          ))}
        </nav>

        <div className="td-sidebar-bottom">
          <button
            type="button"
            className="td-account-mini td-account-profile-button"
            onClick={() => selectPage('profile')}
            aria-label="Open my profile"
          >
            {teacher.photoUrl ? (
              <img src={teacher.photoUrl} alt="" />
            ) : (
              <span className="td-avatar-initial">
                {initial}
              </span>
            )}

            <div>
              <strong>{displayName}</strong>
              <span>Teacher account</span>
            </div>
          </button>

          <button
            type="button"
            className="td-nav-item td-logout-item"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <MenuIcon type="logout" />
            <span>
              {loggingOut ? 'Logging out...' : 'Log out'}
            </span>
          </button>
        </div>
      </aside>

      <div className="td-main">
        <header className="td-topbar">
          <button
            type="button"
            className="td-mobile-menu"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            <MenuIcon type={sidebarOpen ? 'close' : 'menu'} />
          </button>

          <div className="td-topbar-title">
            <span>Teacher Portal</span>
            <small>AttendX workspace</small>
          </div>

          <button
            type="button"
            className="td-profile-trigger"
            onClick={() => selectPage('profile')}
            aria-label="Open my profile"
            title="My Profile"
          >
            {teacher.photoUrl ? (
              <img src={teacher.photoUrl} alt="" />
            ) : (
              <span>{initial}</span>
            )}
          </button>
        </header>

        <section className="td-content">
          {logoutError && (
            <p className="td-error" role="alert">
              {logoutError}
            </p>
          )}

          {renderPage()}

          <footer className="td-footer">
            <span>AttendX</span>
            <span>Secure teacher workspace</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
