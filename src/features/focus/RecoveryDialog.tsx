import { minutesToHM } from '../../lib/dates'
import { useTimer } from './timer'

/** Shown when a running session survived a long suspension or device sleep. */
export function RecoveryDialog() {
  const recovery = useTimer((s) => s.recovery)
  const keep = useTimer((s) => s.keepRecovery)
  const discard = useTimer((s) => s.discardRecovery)
  if (!recovery) return null
  const minutes = Math.max(1, Math.round(recovery.ms / 60_000))
  const hours = Math.round(recovery.wall / 3_600_000)

  return (
    <div className="recovery-overlay" role="dialog" aria-modal="true" aria-label="Interrupted session">
      <div className="recovery-card">
        <div className="label" style={{ color: 'var(--accent)' }}>Session recovery</div>
        <h2 className="display display-md mt-4">Your session was interrupted.</h2>
        <p className="muted mt-5 text-[13px] leading-relaxed">
          This timer was still running about {hours || 1} hour{hours === 1 ? '' : 's'} ago. To avoid banking time you did not study,
          we paused it at <strong>{minutesToHM(minutes)}</strong>. You decide what to keep.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void keep()}>Keep {minutes} min</button>
          <button className="btn" onClick={discard}>Discard it</button>
        </div>
      </div>
    </div>
  )
}
