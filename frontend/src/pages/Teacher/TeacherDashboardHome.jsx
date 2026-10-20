
import './TeacherDashboardHome.css'

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
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[type] || paths.grid}
    </svg>
  )
}

export default function TeacherDashboardHome({
  displayName,
  onStartAttendance,
  onViewHistory,
}) {
  return (
    <>
      <section className="td-welcome">
        <div>
          <span className="td-eyebrow">TEACHER WORKSPACE</span>
          <h1>Welcome back, {displayName}</h1>
          <p>
            Manage your classes and attendance from one place.
          </p>
        </div>

        <div className="td-welcome-mark" aria-hidden="true">
          <MenuIcon type="grid" />
        </div>
      </section>

      <div className="td-section-heading">
        <div>
          <h2>Your workspace</h2>
          <p>Choose what you want to do next.</p>
        </div>
      </div>

      <section className="td-feature-grid td-dashboard-feature-grid">
        <article className="td-feature-card td-feature-primary">
          <span className="td-card-label">ATTENDANCE</span>

          <div className="td-feature-icon td-icon-purple">
            <MenuIcon type="qr" />
          </div>

          <h3>Start attendance</h3>
          <p>
            Create a class session and prepare attendance for your students.
          </p>

          <button
            type="button"
            className="td-action-button"
            onClick={onStartAttendance}
          >
            <span>Create session</span>
            <MenuIcon type="arrow" />
          </button>
        </article>

        <article className="td-feature-card">
          <span className="td-card-label">RECORDS</span>

          <div className="td-feature-icon td-icon-teal">
            <MenuIcon type="history" />
          </div>

          <h3>Attendance history</h3>
          <p>
            Review your previous sessions and their attendance records.
          </p>

          <button
            type="button"
            className="td-action-button td-action-secondary"
            onClick={onViewHistory}
          >
            <span>View sessions</span>
            <MenuIcon type="arrow" />
          </button>
        </article>
      </section>

      <div className="td-notice">
        <span className="td-notice-dot" />
        Your workspace is connected to your signed-in teacher account.
      </div>
    </>
  )
}
