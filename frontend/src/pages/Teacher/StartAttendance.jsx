
import { useState } from 'react'
import {
  ArrowLeft,
  MapPin,
  Plus,
  Trash2,
  CalendarDays,
  Clock3,
  BookOpen,
  Users,
  LoaderCircle,
} from 'lucide-react'
import './StartAttendance.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function getTodayDate() {
  const now = new Date()
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )

  return localDate.toISOString().slice(0, 10)
}

function StartAttendance({ onBack }) {
  const [course, setCourse] = useState('')
  const [subject, setSubject] = useState('')
  const [className, setClassName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [sections, setSections] = useState([''])
  const [date, setDate] = useState(getTodayDate())
  const [classStartTime, setClassStartTime] = useState('')
  const [classEndTime, setClassEndTime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('5')
  const [radiusMeters, setRadiusMeters] = useState('75')
  const [customRadius, setCustomRadius] = useState('')
  const [location, setLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateSection = (index, value) => {
    setSections((current) =>
      current.map((section, i) => (i === index ? value : section))
    )
  }

  const addSection = () => {
    if (sections.length < 20) {
      setSections((current) => [...current, ''])
    }
  }

  const removeSection = (index) => {
    setSections((current) => current.filter((_, i) => i !== index))
  }

  const captureLocation = () => {
    setError('')
    setLocationStatus('Getting your current location...')
    setLocation(null)

    if (!navigator.geolocation) {
      setLocationStatus('')
      setError('Geolocation is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords

        setLocation({
          latitude,
          longitude,
          accuracy,
          capturedAt: new Date().toISOString(),
        })

        setLocationStatus(
          `Location captured. Reported accuracy: ${Math.round(accuracy)} metres.`
        )
      },
      (locationError) => {
        setLocation(null)
        setLocationStatus('')

        if (locationError.code === locationError.PERMISSION_DENIED) {
          setError(
            'Location permission was denied. Allow location access and try again.'
          )
        } else if (locationError.code === locationError.TIMEOUT) {
          setError('Location request timed out. Please try again.')
        } else {
          setError('Could not get your location. Please try again.')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  const handleContinue = async (event) => {
    event.preventDefault()
    setError('')

    const selectedSections = [
      ...new Set(
        sections
          .map((section) => section.trim())
          .filter(Boolean)
      ),
    ]

    const enteredSections = sections.filter((section) =>
      section.trim()
    )

    if (!course.trim() || !subject.trim()) {
      setError('Please enter both the course and subject.')
      return
    }

    if (selectedSections.length === 0) {
      setError('Please enter at least one section.')
      return
    }

    if (selectedSections.length !== enteredSections.length) {
      setError('Section names must be unique.')
      return
    }

    if (!date || !classStartTime || !classEndTime) {
      setError('Please select the class date, start time and end time.')
      return
    }

    const classStart = new Date(`${date}T${classStartTime}`)
    const classEnd = new Date(`${date}T${classEndTime}`)

    if (
      Number.isNaN(classStart.getTime()) ||
      Number.isNaN(classEnd.getTime()) ||
      classEnd <= classStart
    ) {
      setError('Class end time must be later than class start time.')
      return
    }

    if (!location) {
      setError(
        'Capture your current classroom location before starting attendance.'
      )
      return
    }

    const selectedRadius =
      radiusMeters === 'custom'
        ? Number(customRadius)
        : Number(radiusMeters)

    if (
      !Number.isFinite(selectedRadius) ||
      selectedRadius < 5 ||
      selectedRadius > 500
    ) {
      setError('Enter a custom radius between 5 and 500 metres.')
      return
    }

    if (
      !Number.isFinite(location.accuracy) ||
      location.accuracy <= 0
    ) {
      setError('Location accuracy is invalid. Capture your location again.')
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
            roomName: roomName.trim() || undefined,
            sections: selectedSections,
            latitude: location.latitude,
            longitude: location.longitude,
            radiusMeters: selectedRadius,
            durationMinutes: Number(durationMinutes),
            scheduledStartsAt: classStart.toISOString(),
            scheduledEndsAt: classEnd.toISOString(),
            locationAccuracyMeters: location.accuracy,
            locationCapturedAt: location.capturedAt,
          }),
        }
      )

      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message || 'Could not create the attendance session.'
        )
      }

      if (typeof onBack === 'function') {
        onBack()
      }
    } catch (requestError) {
      setError(
        requestError.message ||
          'Unable to connect to the server. Check your connection and try again.'
      )
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
        </p>

        <form
          onSubmit={handleContinue}
          className="td-attendance-form"
        >
          <div className="td-form-group">
            <label htmlFor="attendance-course">
              <BookOpen size={16} /> Course
            </label>
            <input
              id="attendance-course"
              type="text"
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              placeholder="e.g. MCA"
              maxLength={150}
              required
            />
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-subject">Subject</label>
            <input
              id="attendance-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. DevOps on Cloud"
              maxLength={150}
              required
            />
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

            <button
              type="button"
              className="td-add-section-btn"
              onClick={addSection}
              disabled={sections.length >= 20}
            >
              <Plus size={16} />
              Add another section
            </button>
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
              onChange={(event) => setDate(event.target.value)}
              required
            />
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
              onChange={(event) => setClassStartTime(event.target.value)}
              required
            />
          </div>

          <div className="td-form-group">
            <label htmlFor="class-end-time">Class End Time</label>
            <input
              id="class-end-time"
              type="time"
              value={classEndTime}
              onChange={(event) => setClassEndTime(event.target.value)}
              required
            />
          </div>

          <div className="td-form-group">
            <label htmlFor="attendance-radius">Attendance Radius</label>
            <select
              id="attendance-radius"
              value={radiusMeters}
              onChange={(event) => setRadiusMeters(event.target.value)}
              required
            >
              <option value="50">50 metres</option>
              <option value="75">75 metres</option>
              <option value="100">100 metres</option>
              <option value="custom">Custom radius</option>
            </select>
          </div>

          {radiusMeters === 'custom' && (
            <div className="td-form-group">
              <label htmlFor="custom-radius">
                Custom Radius (metres)
              </label>
              <input
                id="custom-radius"
                type="number"
                min="5"
                max="500"
                value={customRadius}
                onChange={(event) => setCustomRadius(event.target.value)}
                placeholder="Enter 5–500 metres"
                required
              />
            </div>
          )}

          <div className="td-form-group td-form-full">
            <label>
              <MapPin size={16} /> Classroom Location
            </label>
            <p className="td-form-help">
              Capture your current location for this session. It will not
              be reused automatically for your next class.
            </p>

            <button
              type="button"
              className="td-secondary-btn"
              onClick={captureLocation}
              disabled={isSubmitting}
            >
              <MapPin size={16} />
              Use Current Location
            </button>

            {locationStatus && (
              <p className="td-form-help" role="status">
                {locationStatus}
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
