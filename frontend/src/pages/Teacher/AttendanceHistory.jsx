import './AttendanceHistory.css'
function AttendanceHistory({ onBack }) {
  return (
    <section className="td-page-content">
      <div className="td-page-heading">
        <div>
          <p className="td-eyebrow">ATTENDANCE MANAGEMENT</p>
          <h1>Attendance History</h1>
          <p>
            View your previous attendance sessions and records.
          </p>
        </div>

        <button
          type="button"
          className="td-secondary-btn"
          onClick={onBack}
        >
          Back to Dashboard
        </button>
      </div>

      <div className="td-placeholder">
        <h2>No attendance records loaded</h2>
        <p>
          Your previous sessions will appear here after we connect
          this page to the attendance API.
        </p>
      </div>
    </section>
  )
}

export default AttendanceHistory
