
import {
  ArrowRight,
  ArrowDownRight,
  ShieldCheck,
  MapPin,
  QrCode,
  Clock3,
  Users,
  CheckCircle2,
  Smartphone,
  Zap,
  GraduationCap,
  Menu,
  X,
  Fingerprint,
  LockKeyhole,
} from 'lucide-react'

import './Home.css'



const features = [
  {
    icon: QrCode,
    title: 'Dynamic QR verification',
    description:
      'Short-lived attendance codes designed to reduce QR sharing and replay attempts.',
    className: 'feature-icon-purple',
  },
  {
    icon: MapPin,
    title: 'Location-aware attendance',
    description:
      'Session-specific teacher location and student location are checked by the backend.',
    className: 'feature-icon-blue',
  },
  {
    icon: Fingerprint,
    title: 'Layered verification',
    description:
      'Attendance decisions consider session validity, timing, identity details and duplicate checks.',
    className: 'feature-icon-green',
  },
  {
    icon: Zap,
    title: 'Built for busy classrooms',
    description:
      'Designed for concurrent submissions, reliable database writes and safe error handling.',
    className: 'feature-icon-orange',
  },
]

const workflow = [
  {
    number: '01',
    title: 'Teacher starts a session',
    description:
      'The teacher selects a course, subject, sections, duration and attendance radius.',
  },
  {
    number: '02',
    title: 'Students verify attendance',
    description:
      'Students scan the session QR or use its temporary code, then enter their details.',
  },
  {
    number: '03',
    title: 'The server validates',
    description:
      'The backend checks the session, timing, location, security signals and duplicate status.',
  },
  {
    number: '04',
    title: 'The result is recorded',
    description:
      'A valid submission is recorded as PRESENT only after successful database confirmation.',
  },
]

function Brand({ footer = false }) {
  return (
    <a
      className={`home-brand${footer ? ' home-brand-footer' : ''}`}
      href="#home"
      aria-label="AttendX home"
    >
      <span className="home-brand-mark" aria-hidden="true">
        <QrCode size={23} strokeWidth={2.2} />
      </span>

      <span className="home-brand-name">
        Attend<span>X</span>
        <small>SMART ATTENDANCE</small>
      </span>
    </a>
  )
}

function Home() {
  return (
    <div className="home-page" id="home">
      <header className="home-header">
        <div className="home-container home-header-inner">
          <Brand />

          <nav className="home-nav" aria-label="Main navigation">
            <a className="home-nav-features" href="#features">Features</a>
            <a className="home-nav-workflow" href="#how-it-works">How it works</a>
            <a className="home-nav-security" href="#security">Security</a>
          </nav>

          <div className="home-header-actions">
            <a
              className="home-header-role home-header-role-admin"
              href="/admin/login"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              Admin
            </a>
            <a
              className="home-header-role home-header-role-teacher"
              href="/teacher/login"
            >
              <GraduationCap size={15} aria-hidden="true" />
              Teacher
            </a>
            <a className="home-header-cta" href="#access">
              Explore access
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="home-container home-hero-grid">
            <div className="home-hero-content">
              <div className="home-eyebrow">
                <span className="home-status-dot" />
                SMARTER ATTENDANCE STARTS HERE
              </div>

              <h1>
                Attendance that
                <br />
                <span>keeps you</span>
                <br />
                <span className="home-heading-accent">in the loop.</span>
              </h1>

              <p className="home-hero-description">
                A modern, location-aware attendance experience for
                classrooms. Dynamic QR verification, session-based
                checks and reliable attendance records—all in one place.
              </p>

              <div className="home-hero-actions">
                <a className="home-button home-button-primary" href="#how-it-works">
                  Discover how it works
                  <ArrowRight size={18} aria-hidden="true" />
                </a>

                <a className="home-button home-button-secondary" href="#features">
                  Explore features
                  <ArrowDownRight size={18} aria-hidden="true" />
                </a>
              </div>

              <div className="home-trust-note">
                <ShieldCheck size={18} aria-hidden="true" />
                <span>Security-first design. Transparent verification.</span>
              </div>
            </div>

            <div className="home-hero-visual" aria-label="Illustration of the attendance verification process">
              <div className="home-orbit home-orbit-one" />
              <div className="home-orbit home-orbit-two" />

              <div className="home-float-card home-float-top">
                <span className="home-float-icon">
                  <MapPin size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>Location check</strong>
                  <small>Session-specific verification</small>
                </span>
                <span className="home-mini-check">
                  <CheckCircle2 size={17} aria-hidden="true" />
                </span>
              </div>

              <div className="home-qr-card">
                <div className="home-qr-card-header">
                  <span className="home-qr-live">
                    <span />
                    LIVE SESSION
                  </span>
                  <span className="home-qr-menu" aria-hidden="true">
                    •••
                  </span>
                </div>

                <div className="home-qr-frame">
                  <div className="home-qr-pattern" aria-hidden="true">
                    <span className="qr-finder qr-finder-one">
                      <i />
                    </span>
                    <span className="qr-finder qr-finder-two">
                      <i />
                    </span>
                    <span className="qr-finder qr-finder-three">
                      <i />
                    </span>
                    <span className="qr-block qr-block-one" />
                    <span className="qr-block qr-block-two" />
                    <span className="qr-block qr-block-three" />
                    <span className="qr-block qr-block-four" />
                    <span className="qr-block qr-block-five" />
                    <span className="qr-block qr-block-six" />
                    <span className="qr-block qr-block-seven" />
                    <span className="qr-block qr-block-eight" />
                    <span className="qr-block qr-block-nine" />
                    <span className="qr-block qr-block-ten" />
                    <span className="qr-block qr-block-eleven" />
                    <span className="qr-block qr-block-twelve" />
                    <span className="qr-block qr-block-thirteen" />
                    <span className="qr-block qr-block-fourteen" />
                    <span className="qr-block qr-block-fifteen" />
                    <span className="qr-block qr-block-sixteen" />
                    <span className="qr-block qr-block-seventeen" />
                    <span className="qr-block qr-block-eighteen" />
                    <span className="qr-block qr-block-nineteen" />
                    <span className="qr-block qr-block-twenty" />
                    <span className="qr-block qr-block-twenty-one" />
                    <span className="qr-block qr-block-twenty-two" />
                    <span className="qr-block qr-block-twenty-three" />
                    <span className="qr-block qr-block-twenty-four" />
                  </div>
                  <div className="home-qr-scan-line" />
                </div>

                <div className="home-qr-card-footer">
                  <span className="home-qr-shield">
                    <ShieldCheck size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Verify your attendance</strong>
                    <small>Secure, session-linked workflow</small>
                  </span>
                </div>
              </div>

              <div className="home-float-card home-float-bottom">
                <span className="home-float-icon home-float-icon-green">
                  <LockKeyhole size={17} aria-hidden="true" />
                </span>
                <span>
                  <strong>Duplicate protection</strong>
                  <small>Database-enforced checks</small>
                </span>
              </div>

              <div className="home-visual-caption">
                <span className="home-caption-line" aria-hidden="true" />
                <span>VERIFY · VALIDATE · RECORD</span>
              </div>
            </div>
          </div>

          <div className="home-container">
            <div className="home-hero-bottom">
              <span>DESIGNED FOR REAL CLASSROOM WORKFLOWS</span>
              <div className="home-hero-bottom-items">
                <span>
                  <QrCode size={16} aria-hidden="true" />
                  Dynamic QR
                </span>
                <span>
                  <MapPin size={16} aria-hidden="true" />
                  Location checks
                </span>
                <span>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Server validation
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="home-features section-padding" id="features">
          <div className="home-container">
            <div className="home-section-heading">
              <span className="home-section-label">THE ATTENDX APPROACH</span>
              <h2>
                More than a QR code.
                <br />
                <span>A smarter attendance workflow.</span>
              </h2>
              <p>
                Each layer has a clear purpose, from starting a class
                session to validating and recording a submission.
              </p>
            </div>

            <div className="home-feature-grid">
              {features.map((feature) => {
                const Icon = feature.icon

                return (
                  <article className="home-feature-card" key={feature.title}>
                    <div className={`home-feature-icon ${feature.className}`}>
                      <Icon size={23} strokeWidth={1.9} aria-hidden="true" />
                    </div>

                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>

                    <a href="#how-it-works" className="home-feature-link">
                      Learn more
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="home-workflow section-padding" id="how-it-works">
          <div className="home-container home-workflow-grid">
            <div className="home-workflow-intro">
              <span className="home-section-label">A CLEAR PROCESS</span>
              <h2>
                From classroom
                <br />
                to <span>confirmed.</span>
              </h2>
              <p>
                Attendance follows a defined, session-specific workflow.
                The server—not the browser—makes the final attendance
                decision.
              </p>

              <div className="home-workflow-note">
                <ShieldCheck size={21} aria-hidden="true" />
                <p>
                  A successful location check alone does not mark
                  attendance as PRESENT. All required validations must pass.
                </p>
              </div>
            </div>

            <div className="home-workflow-list">
              {workflow.map((step) => (
                <article className="home-workflow-step" key={step.number}>
                  <div className="home-step-number">{step.number}</div>

                  <div className="home-step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>

                  <ArrowRight
                    className="home-step-arrow"
                    size={19}
                    aria-hidden="true"
                  />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-security section-padding" id="security">
          <div className="home-container">
            <div className="home-security-panel">
              <div className="home-security-copy">
                <span className="home-section-label home-label-light">
                  BUILT WITH CARE
                </span>
                <h2>
                  Security is part
                  <br />
                  of the process.
                </h2>
                <p>
                  AttendX is designed around server-side validation,
                  session-bound codes and database-enforced duplicate
                  prevention—not just a visual QR scan.
                </p>

                <a className="home-security-link" href="#access">
                  Explore the platform
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
              </div>

              <div className="home-security-list">
                <div>
                  <span className="home-security-list-icon">
                    <LockKeyhole size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Protected access</strong>
                    <small>Role-based authorization on the server</small>
                  </span>
                </div>

                <div>
                  <span className="home-security-list-icon">
                    <Clock3 size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Session-bound verification</strong>
                    <small>Time-limited codes and server-authoritative timing</small>
                  </span>
                </div>

                <div>
                  <span className="home-security-list-icon">
                    <Users size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Safe duplicate handling</strong>
                    <small>Database-level uniqueness and atomic writes</small>
                  </span>
                </div>

                <div>
                  <span className="home-security-list-icon">
                    <ShieldCheck size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Honest location checks</strong>
                    <small>GPS signals are useful evidence, not absolute proof</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="home-access section-padding" id="access">
          <div className="home-container">
            <div className="home-access-heading">
              <span className="home-section-label">ONE PLATFORM, CLEAR ROLES</span>
              <h2>Made for the classroom community.</h2>
              <p>
                Separate workflows for administration, teachers and
                students—with no student account required for MVP attendance.
              </p>
            </div>

            <div className="home-access-grid">
              <article className="home-access-card">
                <div className="home-access-icon access-icon-admin">
                  <ShieldCheck size={23} aria-hidden="true" />
                </div>
                <h3>Administrator</h3>
                <p>
                  Manage teacher requests, approvals and account status.
                </p>
                <span className="home-access-status">
                  <span />
                  Admin portal planned
                </span>
              </article>

              <article className="home-access-card home-access-card-featured">
                <div className="home-access-icon access-icon-teacher">
                  <GraduationCap size={24} aria-hidden="true" />
                </div>
                <h3>Teacher</h3>
                <p>
                  Set up class sessions, display attendance codes and
                  review records.
                </p>
                <span className="home-access-status">
                  <span />
                  Teacher portal planned
                </span>
              </article>

              <article className="home-access-card">
                <div className="home-access-icon access-icon-student">
                  <Smartphone size={23} aria-hidden="true" />
                </div>
                <h3>Student</h3>
                <p>
                  Scan a session QR or enter its temporary code, then
                  submit attendance details.
                </p>
                <span className="home-access-status">
                  <span />
                  No student login required
                </span>
              </article>
            </div>

            <div className="home-access-note">
              <LockKeyhole size={17} aria-hidden="true" />
              <span>
                Portal navigation and attendance submission will be
                connected when their pages and secure backend flows are
                implemented.
              </span>
            </div>
          </div>
        </section>

        <section className="home-final-cta">
          <div className="home-container home-final-cta-inner">
            <div>
              <span className="home-section-label">ATTENDX · SMART ATTENDANCE</span>
              <h2>Make every classroom session count.</h2>
              <p>
                A thoughtful approach to attendance, verification and
                classroom workflows.
              </p>
            </div>

            <a className="home-button home-button-white" href="#home">
              Back to top
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-container home-footer-inner">
          <Brand footer />

          <p>
            Smart attendance, designed with security and reliability in mind.
          </p>

          <span className="home-footer-copy">
            © {new Date().getFullYear()} AttendX
          </span>
        </div>
      </footer>
    </div>
  )
}

export default Home
