
import { Clock3, RefreshCw, ShieldCheck } from 'lucide-react'
import './SymbolChallenge.css'

export default function SymbolChallenge({
  challenge,
  secondsLeft,
  generating,
  disabled,
  onGenerate,
}) {
  const symbols = Array.isArray(challenge?.symbols)
    ? challenge.symbols.flat()
    : []

  const correctAnswers = Array.isArray(challenge?.correctAnswers)
    ? challenge.correctAnswers
    : []

  const remainingSeconds = Number.isFinite(Number(secondsLeft))
    ? Math.max(0, Math.min(15, Number(secondsLeft)))
    : 0

  const progressWidth = `${(remainingSeconds / 15) * 100}%`

  return (
    <section className="la-symbol-challenge" aria-labelledby="la-symbol-title">
      <div className="la-symbol-heading">
        <div>
          <h3 id="la-symbol-title">Classroom Verification</h3>
          <p>Generate a fresh 15-second symbol challenge for this session.</p>
        </div>
        <span className="la-icon-bubble">
          <ShieldCheck size={20} />
        </span>
      </div>

      <button
        type="button"
        className="la-secondary-button la-symbol-generate"
        onClick={onGenerate}
        disabled={disabled || generating}
      >
        <RefreshCw size={16} className={generating ? 'la-spin' : ''} />
        {generating ? 'Generating challenge...' : 'Generate Symbol Challenge'}
      </button>

      {challenge && !disabled && (
        <div className="la-symbol-result">
          <div className="la-expiry-row">
            <span className="la-expiry-label">
              <Clock3 size={15} />
              {remainingSeconds > 0
                ? 'Challenge expires in'
                : 'Challenge expired'}
            </span>
            <strong className={remainingSeconds <= 5 ? 'is-expiring' : ''}>
              {remainingSeconds}s
            </strong>
          </div>

          <div className="la-progress-track" aria-hidden="true">
            <div
              className="la-progress-value"
              style={{ width: progressWidth }}
            />
          </div>

          <div className="la-symbol-grid-wrap">
            <p className="la-code-label">GENERATED SYMBOL GRID</p>
            <div className="la-symbol-grid">
              {symbols.map((symbol, index) => (
                <div className="la-symbol-cell" key={`${symbol}-${index}`}>
                  {symbol}
                </div>
              ))}
            </div>
          </div>

          <div className="la-code-panel la-symbol-sequence">
            <span className="la-code-label">
              TEACHER-ONLY CORRECT SEQUENCE
            </span>
            <strong className="la-code-value">
              {correctAnswers.join('  →  ').toUpperCase()}
            </strong>
            <span className="la-code-hint">
              Announce this sequence verbally. Keep it visible only to the teacher.
            </span>
          </div>
        </div>
      )}

      {!challenge && !disabled && (
        <p className="la-security-note la-symbol-note">
          <ShieldCheck size={16} />
          Generate a challenge after starting the attendance session. The correct
          sequence is visible only on this teacher page.
        </p>
      )}

      {disabled && (
        <p className="la-security-note la-symbol-note">
          <ShieldCheck size={16} />
          Symbol challenge is disabled because this attendance session is closed.
        </p>
      )}
    </section>
  )
}
