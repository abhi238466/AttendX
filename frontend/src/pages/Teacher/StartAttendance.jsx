import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Trash2,
  CalendarDays,
  Clock3,
  BookOpen,
  Users,
  LoaderCircle,
} from 'lucide-react'
import './StartAttendance.css'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  ''
).replace(/\/$/, '')

function getTodayDate() {
  const now = new Date()
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )

  return localDate.toISOString().slice(0, 10)
}

function getRequestError(status, serverMessage) {
  const message = String(serverMessage || '').toLowerCase()

  if (status === 401) {
    return 'Your teacher login has expired. Please log in again and retry.'
  }

  if (status === 403) {
    return 'You are not authorized to create an attendance session. Please check your teacher account.'
  }

  if (status === 404) {
    return 'The attendance service could not be found. Please refresh the page or contact the administrator.'
  }

  if (status === 409) {
    return 'This session conflicts with an existing attendance session or schedule. Please check the class details and try again.'
  }

  if (status === 422 || status === 400) {
    if (message.includes('section')) {
      return 'The section details are invalid. Please check the section names and try again.'
    }

    if (message.includes('time') || message.includes('date')) {
      return 'The selected class date or timing is invalid. Please check the schedule and try again.'
    }

    if (message.includes('duration')) {
      return 'The attendance duration is invalid. Please select a valid duration.'
    }

    return 'Some class details were rejected by the server. Please review the form and try again.'
  }

  if (status === 429) {
    return 'Too many requests. Please wait a moment before creating the session again.'
  }

  if (status >= 500) {
    return 'The server is temporarily unavailable. Your session could not be confirmed. Please try again shortly.'
  }

  return serverMessage || 'The attendance session could not be created. Please try again.'
}

function FieldError({ message }) {
  if (!message) return null

  return (
    <p className="td-form-error" role="alert">
      {message}
    </p>
  )
}

function StartAttendance({ onBack }) {
  const navigate = useNavigate()

  const [course, setCourse] = useState('')
  const [subject, setSubject] = useState('')
  const [className, setClassName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [sections, setSections] = useState([''])
  const [date, setDate] = useState(getTodayDate())
  const [classStartTime, setClassStartTime] = useState('')
  const [classEndTime, setClassEndTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('5')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const clearFieldError = (field) => {
    setFieldErrors((current) => ({
      ...current,
      [field]: '',
    }))
    setError('')
  }

  const updateSection = (index, value) => {
    setSections((current) =>
      current.map((section, i) => (i === index ? value : section))
    )

    setFieldErrors((current) => ({
      ...current,
      sections: '',
    }))
    setError('')
  }

  const addSection = () => {
    if (sections.length < 20) {
      setSections((current) => [...current, ''])
    }
  }

  const removeSection = (index) => {
    setSections((current) => current.filter((_, i) => i !== index))

    setFieldErrors((current) => ({
      ...current,
      sections: '',
    }))
    setError('')
  }

  const validateForm = () => {
    const errors = {}

    if (!course.trim()) {
      errors.course = 'Please fill in this field.'
    }

    if (!subject.trim()) {
      errors.subject = 'Please enter the subject name.'
    }

    const enteredSections = sections
      .map((section) => section.trim())
      .filter(Boolean)

    if (enteredSections.length === 0) {
      errors.sections = 'Please enter at least one section.'
    } else {
      const normalizedSections = enteredSections.map((section) =>
        section.toLowerCase()
      )

      if (new Set(normalizedSections).size !== normalizedSections.length) {
        errors.sections = 'Duplicate section names found. Each section must be unique.'
      }
    }

    if (!date) {
      errors.date = 'Please select the class date.'
    } else if (date < getTodayDate()) {
      errors.date = 'Past dates cannot be selected. Please choose today or a future date.'
    }

    if (!classStartTime) {
      errors.classStartTime = 'Please select the class start time.'
    }

    if (!classEndTime) {
      errors.classEndTime = 'Please select the class end time.'
    }

    if (
      date &&
      classStartTime &&
      classEndTime &&
      !errors.date &&
      classEndTime <= classStartTime
    ) {
      errors.classEndTime = 'End time must be later than the start time.'
    }

    setFieldErrors(errors)

    return Object.keys(errors).length === 0
  }

  const handleContinue = async (event) => {
    event.preventDefault()

    if (isSubmitting) return

    setError('')

    if (!validateForm()) {
      const firstError = document.querySelector('[aria-invalid="true"]')

      firstError?.focus()

      return
    }

    const selectedSections = [
      ...new Set(
        sections
          .map((section) => section.trim())
          .filter(Boolean)
      ),
    ]

    const classStart = new Date(`${date}T${classStartTime}`)
    const classEnd = new Date(`${date}T${classEndTime}`)

    if (
      Number.isNaN(classStart.getTime()) ||
      Number.isNaN(classEnd.getTime()) ||
      classEnd <= classStart
    ) {
      setFieldErrors({
        classEndTime: 'Please select a valid end time later than the start time.',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/teacher/sessions`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            courseName: course.trim(),
            subjectName: subject.trim(),
            className: className.trim() || undefined,
            roomName: roomName.trim() || undefined,
            sections: selectedSections,
            durationMinutes: Number(durationMinutes),
            scheduledStartsAt: classStart.toISOString(),
            scheduledEndsAt: classEnd.toISOString(),
          }),
        }
      )

      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success === false) {
        throw new Error(
          getRequestError(
            response.status,
            result.message || result.error
          )
        )
      }

      const createdSessionId = result.session?.id

      if (!createdSessionId) {
        throw new Error(
          'The server did not return the new session ID. Please check your attendance sessions before trying again.'
        )
      }

      navigate(
        `/teacher/live-attendance/${encodeURIComponent(createdSessionId)}`
      )
    } catch (requestError) {
      if (requestError instanceof TypeError) {
        setError(
          'Unable to connect to the server. Please check your internet connection and try again.'
        )
      } else {
        setError(
          requestError.message ||
          'The attendance session could not be created. Please try again.'
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="td-page-content">
      <div className="td-page-heading">
        <div>
          <p className="td-eyebrow">ATTENDANCE MANAGEMENT</p>
          <h1>Start Attendance</h1>
          <p>Configure your class and attendance settings.</p>
        </div>

        <button
          type="button"
          className="td-secondary-btn"
          onClick={onBack}
          disabled={isSubmitting}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>

      <div className="td-attendance-form-card">
        <h2>Session Details</h2>
        <p className="td-form-description">
          Enter class details, select sections and configure attendance.
          Fields marked Optional can be left blank.
        </p>

        <form
          onSubmit={handleContinue}
          className="td-attendance-form"
          noValidate
        >
          <div className="td-form-group">
            <label htmlFor="attendance-course">
              <BookOpen size={16} /> Course
            </label>
            <input
              id="attendance-course"
              type="text"
              value={course}
              onChange={(event) => {
                setCourse(event.target.value)
                clearFieldError('course')
              }}
              placeholder="e.g. MCA"
              maxLength={150}
              required
              aria-invalid={Boolean(fieldErrors.course)}
              aria-describedby={fieldErrors.course ? 'course-error' : undefined}
            />
            {fieldErrors.course && (
              <p id="course-error" className="td-form-error" role="alert">
                {fieldErrors.course}
              </p>
            )}
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-subject">Subject</label>
            <input
              id="attendance-subject"
              type="text"
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value)
                clearFieldError('subject')
              }}
              placeholder="e.g. DevOps on Cloud"
              maxLength={150}
              required
              aria-invalid={Boolean(fieldErrors.subject)}
              aria-describedby={fieldErrors.subject ? 'subject-error' : undefined}
            />
            {fieldErrors.subject && (
              <p id="subject-error" className="td-form-error" role="alert">
                {fieldErrors.subject}
              </p>
            )}
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-class">
              Class / Semester <span>(Optional)</span>
            </label>
            <input
              id="attendance-class"
              type="text"
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              placeholder="e.g. MCA Semester III"
              maxLength={100}
            />
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-room">
              Classroom Name <span>(Optional)</span>
            </label>
            <input
              id="attendance-room"
              type="text"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="e.g. Lab 204"
              maxLength={100}
            />
          </div>

          <div className="td-form-group td-form-full">
            <label>
              <Users size={16} /> Sections
            </label>
            <p className="td-form-help">
              Add every section attending this class, such as G1, A1 or A2.
              At least one section is required.
            </p>

            <div className="td-section-input-list">
              {sections.map((section, index) => (
                <div className="td-section-input-row" key={index}>
                  <input
                    aria-label={`Section ${index + 1}`}
                    type="text"
                    value={section}
                    onChange={(event) =>
                      updateSection(index, event.target.value)
                    }
                    placeholder={`Section ${index + 1}, e.g. G1`}
                    maxLength={50}
                    required={index === 0}
                    aria-invalid={Boolean(fieldErrors.sections)}
                  />

                  {sections.length > 1 && (
                    <button
                      type="button"
                      className="td-section-remove-btn"
                      onClick={() => removeSection(index)}
                      aria-label={`Remove section ${index + 1}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {fieldErrors.sections && (
              <p className="td-form-error" role="alert">
                {fieldErrors.sections}
              </p>
            )}

            <button
              type="button"
              className="td-add-section-btn"
              onClick={addSection}
              disabled={sections.length >= 20}
            >
              <Plus size={16} />
              Add another section
            </button>

            {sections.length >= 20 && (
              <p className="td-form-help">
                Maximum 20 sections are allowed.
              </p>
            )}
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-date">
              <CalendarDays size={16} /> Class Date
            </label>
            <input
              id="attendance-date"
              type="date"
              value={date}
              min={getTodayDate()}
              onChange={(event) => {
                setDate(event.target.value)
                clearFieldError('date')
              }}
              required
              aria-invalid={Boolean(fieldErrors.date)}
            />
            {fieldErrors.date && (
              <p className="td-form-error" role="alert">
                {fieldErrors.date}
              </p>
            )}
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-duration">
              <Clock3 size={16} /> Attendance Duration
            </label>
            <select
              id="attendance-duration"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              required
            >
              <option value="1">1 minute</option>
              <option value="2">2 minutes</option>
              <option value="3">3 minutes</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="20">20 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
              <option value="120">120 minutes</option>
              <option value="240">240 minutes</option>
            </select>
          </div>

          <div className="td-form-group">
            <label htmlFor="class-start-time">Class Start Time</label>
            <input
              id="class-start-time"
              type="time"
              value={classStartTime}
              onChange={(event) => {
                setClassStartTime(event.target.value)
                clearFieldError('classStartTime')
                clearFieldError('classEndTime')
              }}
              required
              aria-invalid={Boolean(fieldErrors.classStartTime)}
            />
            {fieldErrors.classStartTime && (
              <p className="td-form-error" role="alert">
                {fieldErrors.classStartTime}
              </p>
            )}
          </div>

          <div className="td-form-group">
            <label htmlFor="class-end-time">Class End Time</label>
            <input
              id="class-end-time"
              type="time"
              value={classEndTime}
              onChange={(event) => {
                setClassEndTime(event.target.value)
                clearFieldError('classEndTime')
              }}
              required
              aria-invalid={Boolean(fieldErrors.classEndTime)}
            />
            {fieldErrors.classEndTime && (
              <p className="td-form-error" role="alert">
                {fieldErrors.classEndTime}
              </p>
            )}
          </div>

          {error && (
            <div className="td-form-error td-form-full" role="alert">
              {error}
            </div>
          )}

          <div className="td-form-full">
            <button
              type="submit"
              className="td-primary-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={17} />
                  Creating Session...
                </>
              ) : (
                'Start Attendance'
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

export default StartAttendance
