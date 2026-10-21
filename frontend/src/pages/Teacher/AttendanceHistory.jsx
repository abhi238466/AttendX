import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  FileText,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import './AttendanceHistory.css'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ''

function getErrorMessage(error, fallback) {
  return error?.message || fallback
}

function formatDate(value) {
  if (!value) return 'Date not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date not available'

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(value) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateTime(value) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'

  const time = formatTime(value)
  return time ? `${formatDate(value)}, ${time}` : formatDate(value)
}

function isPresent(record) {
  return String(record?.status || '').toUpperCase() === 'PRESENT'
}

function sortByClassRoll(records) {
  return [...records].sort((a, b) => {
    const left = String(a.classRollNumber ?? '').trim()
    const right = String(b.classRollNumber ?? '').trim()
    const leftNumber = Number(left)
    const rightNumber = Number(right)

    if (left !== '' && right !== '' &&
      Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber
    }

    return left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

function getSessionTitle(session) {
  const subject = session.subjectName?.trim()
  const course = session.courseName?.trim()
  return [subject, course].filter(Boolean).join(' — ') || 'Attendance Session'
}

function getSessionDate(session) {
  return (
    session.scheduledStartsAt ||
    session.startsAt ||
    session.createdAt
  )
}

function getSessionEnd(session) {
  return session.scheduledEndsAt || session.endsAt
}

function normalizeSection(value) {
  return String(value || '').trim().toUpperCase()
}

function groupPresentRecords(session) {
  const sections = Array.isArray(session.sections) ? session.sections : []
  const presentRecords = (Array.isArray(session.records) ? session.records : [])
    .filter(isPresent)

  return sections.map((section) => ({
    name: section,
    records: sortByClassRoll(
      presentRecords.filter(
        (record) => normalizeSection(record.section) === normalizeSection(section)
      )
    ),
  }))
}

function AttendanceHistory({ onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeDialog, setActiveDialog] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    fullName: '',
    classRollNumber: '',
    universityRollNumber: '',
    section: '',
  })
  const [sessionForm, setSessionForm] = useState({
    courseName: '',
    subjectName: '',
    className: '',
    roomName: '',
    sections: '',
  })

  const loadHistory = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)

    setPageError('')

    try {
      const response = await fetch(`${API_BASE}/api/teacher/sessions/history`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || 'Could not load attendance history.'
        )
      }

      const ownedSessions = Array.isArray(payload.sessions)
        ? payload.sessions
        : []

      setSessions(ownedSessions.map((session) => ({
        ...session,
        records: Array.isArray(session.records) ? session.records : [],
      })))
    } catch (error) {
      setPageError(
        getErrorMessage(
          error,
          'Could not load attendance history. Please try again.'
        )
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  // Automatically dismiss success and error notifications after 4 seconds.
  useEffect(() => {
    if (!notice && !pageError) return undefined

    const timeoutId = window.setTimeout(() => {
      setNotice('')
      setPageError('')
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [notice, pageError])

  const visibleSessions = useMemo(() => sessions, [sessions])

  function openAddStudent(session, section) {
    if (!Array.isArray(session.sections) || session.sections.length === 0) {
      setPageError('This session has no configured sections, so a student cannot be added.');
      setNotice('');
      return;
    }

    setPageError('');
    setNotice('');
    setForm({
      fullName: '',
      classRollNumber: '',
      universityRollNumber: '',
      section: section || session.sections?.[0] || '',
    })
    setFormError('')
    setActiveDialog({ type: 'add-student', session })
  }

  function openEditStudent(session, record) {
    setForm({
      fullName: record.fullName || '',
      classRollNumber: record.classRollNumber || '',
      universityRollNumber: record.universityRollNumber || '',
      section: record.section || session.sections?.[0] || '',
    })
    setFormError('')
    setActiveDialog({ type: 'edit-student', session, record })
  }

  async function submitStudent(event) {
    event.preventDefault()
    if (!activeDialog?.session) return

    if (!form.fullName.trim() || !form.classRollNumber.trim() || !form.universityRollNumber.trim() || !form.section) {
      setFormError('Please fill in all student details.');
      return;
    }

    setSaving(true)
    setFormError('')

    const isEdit = activeDialog.type === 'edit-student'
    const url = isEdit
      ? `${API_BASE}/api/attendance/records/${activeDialog.record.id}/manual`
      : `${API_BASE}/api/attendance/manual`

    const body = isEdit
      ? {
          fullName: form.fullName.trim(),
          classRollNumber: form.classRollNumber.trim(),
          universityRollNumber: form.universityRollNumber.trim(),
          section: form.section,
        }
      : {
          attendanceSessionId: activeDialog.session.id,
          fullName: form.fullName.trim(),
          classRollNumber: form.classRollNumber.trim(),
          universityRollNumber: form.universityRollNumber.trim(),
          section: form.section,
        }

    try {
      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          payload.message || payload.error || 'Could not save student details.'
        )
      }

      setActiveDialog(null)
      setNotice(isEdit ? 'Student record updated.' : 'Student added to attendance.')
      await loadHistory({ quiet: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Could not save student details.'))
    } finally {
      setSaving(false)
    }
  }

  function requestDeleteStudent(session, record) {
    setConfirmDialog({
      type: 'delete-student',
      title: 'Delete student record?',
      message: `Delete ${record.fullName || 'this student record'} from this attendance session? This action cannot be undone.`,
      session,
      record,
    })
  }

  function requestDeleteSession(session) {
    setConfirmDialog({
      type: 'delete-session',
      title: 'Delete attendance session?',
      message: `Permanently delete "${getSessionTitle(session)}" and all attendance records belonging to this session? Other sessions will not be deleted.`,
      session,
    })
  }

  async function confirmDelete() {
    if (!confirmDialog || saving) return

    const currentConfirmation = confirmDialog
    setSaving(true)
    setNotice('')
    setPageError('')
    setConfirmDialog(null)

    try {
      if (currentConfirmation.type === 'delete-student') {
        const response = await fetch(
          `${API_BASE}/api/attendance/records/${currentConfirmation.record.id}/manual`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(
            payload.message || payload.error ||
            'Could not delete this student record. The backend delete route may not be installed yet.'
          )
        }

        setNotice('Student record deleted.')
        await loadHistory({ quiet: true })
      } else if (currentConfirmation.type === 'delete-session') {
        const session = currentConfirmation.session
        const response = await fetch(
          `${API_BASE}/api/teacher/sessions/${session.id}`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || payload.message || 'Could not delete session.')
        }

        setSessions((current) => current.filter((item) => item.id !== session.id))
        setNotice('Attendance session and its attendance records deleted successfully.')
      }
    } catch (error) {
      setPageError(getErrorMessage(error, 'Could not complete the delete request.'))
    } finally {
      setSaving(false)
    }
  }

  function openEditSession(session) {
    setPageError('')
    setNotice('')
    setFormError('')
    setSessionForm({
      courseName: session.courseName || '',
      subjectName: session.subjectName || '',
      className: session.className || '',
      roomName: session.roomName || '',
      sections: Array.isArray(session.sections) ? session.sections.join(', ') : '',
    })
    setActiveDialog({ type: 'edit-session', session })
  }

  async function submitSession(event) {
    event.preventDefault()
    if (activeDialog?.type !== 'edit-session' || !activeDialog.session) return

    const sections = sessionForm.sections
      .split(',')
      .map((section) => section.trim())
      .filter(Boolean)

    if (!sessionForm.courseName.trim() || !sessionForm.subjectName.trim() || sections.length === 0) {
      setFormError('Course, subject, and at least one section are required.')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const response = await fetch(
        `${API_BASE}/api/teacher/sessions/${activeDialog.session.id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            courseName: sessionForm.courseName.trim(),
            subjectName: sessionForm.subjectName.trim(),
            className: sessionForm.className.trim(),
            roomName: sessionForm.roomName.trim(),
            sections,
          }),
        }
      )

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Could not update attendance session.')
      }

      setActiveDialog(null)
      setNotice('Attendance session updated.')
      await loadHistory({ quiet: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Could not update attendance session.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="td-page-content td-history-page">
      <div className="td-page-heading td-history-heading">
        <div>
          <p className="td-eyebrow">ATTENDANCE MANAGEMENT</p>
          <h1>Attendance History</h1>
          <p>View, manage and edit your previous attendance sessions.</p>
        </div>

        <div className="td-history-heading-actions">
          <button
            type="button"
            className="td-secondary-btn"
            onClick={() => void loadHistory({ quiet: true })}
            disabled={loading || refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'td-history-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="td-secondary-btn"
            onClick={onBack}
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
        </div>
      </div>

      {(notice || pageError) && (
        <div className="td-history-toast-stack" aria-live="polite" aria-atomic="true">
          {notice && (
            <div className="td-history-alert td-history-alert-success" role="status">
              <CheckCircle2 size={17} />
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {pageError && (
            <div className="td-history-alert td-history-alert-error" role="alert">
              <span>{pageError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setPageError('')}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="td-history-state">
          <RefreshCw size={24} className="td-history-spin" />
          <h2>Loading attendance history</h2>
          <p>Fetching sessions belonging to your teacher account.</p>
        </div>
      ) : visibleSessions.length === 0 ? (
        <div className="td-history-state">
          <ClipboardList size={34} />
          <h2>No attendance sessions yet</h2>
          <p>Your completed and previous attendance sessions will appear here.</p>
          <button type="button" className="td-primary-btn" onClick={() => void loadHistory()}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : (
        <div className="td-history-list">
          {visibleSessions.map((session, index) => {
            const sectionGroups = groupPresentRecords(session)
            const allPresentRecords = (session.records || []).filter(isPresent)
            const dateValue = getSessionDate(session)
            const endValue = getSessionEnd(session)
            const isClosed = session.status !== 'ACTIVE'

            return (
              <article className="td-history-session-card" key={session.id}>
                <div className="td-history-session-top">
                  <div>
                    <p className="td-history-session-number">
                      ATTENDANCE SESSION · #{visibleSessions.length - index}
                    </p>
                    <h2>{getSessionTitle(session)}</h2>
                    <p className="td-history-teacher-line">
                      Teacher: {session.teacherName || session.teacher?.name || 'You'}
                    </p>
                  </div>

                  <div className="td-history-session-meta">
                    <span className={`td-history-status ${isClosed ? 'is-closed' : 'is-active'}`}>
                      {isClosed ? 'Closed' : 'Active'}
                    </span>
                    <span>Created: {formatDateTime(session.createdAt)}</span>
                  </div>
                </div>

                <div className="td-history-info-grid">
                  <InfoTile icon={<BookOpen size={18} />} label="Class / Course" value={session.className || session.courseName} />
                  <InfoTile icon={<FileText size={18} />} label="Subject" value={session.subjectName || session.courseName} />
                  {session.semester && (
                    <InfoTile icon={<ClipboardList size={18} />} label="Semester" value={session.semester} />
                  )}
                  {session.roomName && (
                    <InfoTile icon={<MapPin size={18} />} label="Classroom" value={session.roomName} />
                  )}
                  <InfoTile
                    icon={<CalendarDays size={18} />}
                    label="Date & Time"
                    value={formatDate(dateValue)}
                    detail={[formatTime(dateValue), formatTime(endValue)].filter(Boolean).join(' – ')}
                  />
                  <InfoTile
                    icon={<DoorOpen size={18} />}
                    label="Sections"
                    value={(session.sections || []).join(', ') || '—'}
                  />
                </div>

                <div className={`td-history-register-grid ${sectionGroups.length === 1 ? 'has-one-section' : ''}`}>
                  {sectionGroups.map(({ name, records }) => (
                    <section className="td-history-section" key={`${session.id}-${name}`}>
                      <div className="td-history-section-heading">
                        <div className="td-history-section-title">
                          <Users size={22} />
                          <div>
                            <h3>Section {name}</h3>
                            <p>{records.length} Present</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="td-history-add-inline"
                          onClick={() => openAddStudent(session, name)}
                          title={`Add student to section ${name}`}
                          aria-label={`Add student to section ${name}`}
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {records.length === 0 ? (
                        <div className="td-history-empty-section">
                          No present attendance records in this section.
                        </div>
                      ) : (
                        <div className="td-history-table-wrap">
                          <table className="td-history-table">
                            <thead>
                              <tr>
                                <th>Roll</th>
                                <th>Student Name</th>
                                <th>University Roll</th>
                                <th>Status</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {records.map((record) => (
                                <tr key={record.id}>
                                  <td>{record.classRollNumber}</td>
                                  <td>{record.fullName}</td>
                                  <td>{record.universityRollNumber}</td>
                                  <td><span className="td-history-present-badge">Present</span></td>
                                  <td>
                                    <div className="td-history-row-actions">
                                      <button
                                        type="button"
                                        className="td-history-icon-btn"
                                        title="Edit student"
                                        aria-label={`Edit ${record.fullName}`}
                                        onClick={() => openEditStudent(session, record)}
                                      >
                                        <Pencil size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        className="td-history-icon-btn is-danger"
                                        title="Delete student record"
                                        aria-label={`Delete ${record.fullName}`}
                                        onClick={() => requestDeleteStudent(session, record)}
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  ))}
                </div>

                <section className="td-history-erp">
                  <div className="td-history-erp-heading">
                    <FileText size={22} />
                    <div>
                      <h3>ERP Attendance Summary</h3>
                      <p>Only present students’ class roll numbers in ascending order.</p>
                    </div>
                  </div>

                  <div className={`td-history-erp-grid ${sectionGroups.length === 1 ? 'has-one-section' : ''}`}>
                    {sectionGroups.map(({ name, records }) => (
                      <div className="td-history-erp-section" key={`${session.id}-erp-${name}`}>
                        <h4>{name} — Present Roll Numbers</h4>
                        {records.length > 0 ? (
                          <div className="td-history-roll-list">
                            {records.map((record) => (
                              <span key={record.id} className="td-history-roll-chip">
                                {String(record.classRollNumber).trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="td-history-no-rolls">No present roll numbers yet.</p>
                        )}
                        <p className="td-history-total">Total Present: {records.length}</p>
                      </div>
                    ))}
                  </div>
                  <span className="td-history-total-sr-only">
                    Total present across all sections: {allPresentRecords.length}
                  </span>
                </section>

                <div className="td-history-session-footer">
                  <button
                    type="button"
                    className="td-history-add-btn"
                    onClick={() => openAddStudent(session)}
                  >
                    <Plus size={17} />
                    Add Student
                  </button>

                  <div className="td-history-session-actions">
                    <button
                      type="button"
                      className="td-history-edit-session-btn"
                      onClick={() => openEditSession(session)}
                    >
                      <Pencil size={16} />
                      Edit Session
                    </button>
                    <button
                      type="button"
                      className="td-history-delete-session-btn"
                      onClick={() => requestDeleteSession(session)}
                    >
                      <Trash2 size={16} />
                      Delete Session
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {confirmDialog && (
        <div
          className="td-history-modal-backdrop td-history-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setConfirmDialog(null)
          }}
        >
          <section
            className="td-history-modal td-history-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="td-history-confirm-title"
            aria-describedby="td-history-confirm-message"
          >
            <div className="td-history-modal-heading">
              <div>
                <p className="td-eyebrow">PLEASE CONFIRM</p>
                <h2 id="td-history-confirm-title">{confirmDialog.title}</h2>
              </div>
              <button
                type="button"
                className="td-history-modal-close"
                aria-label="Close confirmation"
                disabled={saving}
                onClick={() => setConfirmDialog(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p id="td-history-confirm-message" className="td-history-confirm-message">
              {confirmDialog.message}
            </p>
            <div className="td-history-modal-actions">
              <button
                type="button"
                className="td-secondary-btn"
                disabled={saving}
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="td-history-delete-session-btn"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                <Trash2 size={16} />
                {saving ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </section>
        </div>
      )}

      {activeDialog?.type === 'edit-session' && (
        <div
          className="td-history-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setActiveDialog(null)
          }}
        >
          <section
            className="td-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="td-history-session-modal-title"
          >
            <div className="td-history-modal-heading">
              <div>
                <p className="td-eyebrow">ATTENDANCE MANAGEMENT</p>
                <h2 id="td-history-session-modal-title">Edit Session</h2>
                <p>Update details for this session only.</p>
              </div>
              <button
                type="button"
                className="td-history-modal-close"
                aria-label="Close dialog"
                disabled={saving}
                onClick={() => setActiveDialog(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form className="td-history-form" onSubmit={submitSession}>
              <label>
                Course Name
                <input
                  value={sessionForm.courseName}
                  onChange={(event) => setSessionForm((current) => ({ ...current, courseName: event.target.value }))}
                  maxLength={150}
                  required
                />
              </label>
              <label>
                Subject Name
                <input
                  value={sessionForm.subjectName}
                  onChange={(event) => setSessionForm((current) => ({ ...current, subjectName: event.target.value }))}
                  maxLength={150}
                  required
                />
              </label>
              <div className="td-history-form-row">
                <label>
                  Class Name
                  <input
                    value={sessionForm.className}
                    onChange={(event) => setSessionForm((current) => ({ ...current, className: event.target.value }))}
                    maxLength={100}
                  />
                </label>
                <label>
                  Room Name
                  <input
                    value={sessionForm.roomName}
                    onChange={(event) => setSessionForm((current) => ({ ...current, roomName: event.target.value }))}
                    maxLength={100}
                  />
                </label>
              </div>
              <label>
                Sections (comma-separated)
                <input
                  value={sessionForm.sections}
                  onChange={(event) => setSessionForm((current) => ({ ...current, sections: event.target.value }))}
                  maxLength={1500}
                  required
                />
              </label>

              {formError && <p className="td-history-form-error" role="alert">{formError}</p>}

              <div className="td-history-modal-actions">
                <button
                  type="button"
                  className="td-secondary-btn"
                  disabled={saving}
                  onClick={() => setActiveDialog(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="td-primary-btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Session'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activeDialog && activeDialog.type !== 'edit-session' && (
        <div className="td-history-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setActiveDialog(null)
        }}>
          <section
            className="td-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="td-history-modal-title"
          >
            <div className="td-history-modal-heading">
              <div>
                <p className="td-eyebrow">ATTENDANCE MANAGEMENT</p>
                <h2 id="td-history-modal-title">
                  {activeDialog.type === 'add-student' ? 'Add Student' : 'Edit Student'}
                </h2>
                <p>
                  {activeDialog.session.subjectName || activeDialog.session.courseName}
                </p>
              </div>
              <button
                type="button"
                className="td-history-modal-close"
                aria-label="Close dialog"
                disabled={saving}
                onClick={() => setActiveDialog(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form className="td-history-form" onSubmit={submitStudent}>
              <label>
                Student Full Name
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  maxLength={120}
                  required
                  autoComplete="name"
                />
              </label>
              <div className="td-history-form-row">
                <label>
                  Class Roll Number
                  <input
                    value={form.classRollNumber}
                    onChange={(event) => setForm((current) => ({ ...current, classRollNumber: event.target.value }))}
                    maxLength={50}
                    required
                  />
                </label>
                <label>
                  University Roll Number
                  <input
                    value={form.universityRollNumber}
                    onChange={(event) => setForm((current) => ({ ...current, universityRollNumber: event.target.value }))}
                    maxLength={80}
                    required
                  />
                </label>
              </div>
              <label>
                Section
                <select
                  value={form.section}
                  onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))}
                  required
                >
                  {(activeDialog.session.sections || []).map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </label>

              {formError && <p className="td-history-form-error" role="alert">{formError}</p>}

              <div className="td-history-modal-actions">
                <button
                  type="button"
                  className="td-secondary-btn"
                  disabled={saving}
                  onClick={() => setActiveDialog(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="td-primary-btn" disabled={saving}>
                  {saving ? 'Saving…' : activeDialog.type === 'add-student' ? 'Add Student' : 'Save Changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

function InfoTile({ icon, label, value, detail }) {
  if (value === undefined || value === null || value === '') return null

  return (
    <div className="td-history-info-tile">
      <span className="td-history-info-icon">{icon}</span>
      <div className="td-history-info-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  )
}

export default AttendanceHistory