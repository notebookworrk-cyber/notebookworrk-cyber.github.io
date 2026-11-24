import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { Confirm, SectionLabel } from '../../app/ui'
import { useCourses, useSessions } from '../../db/hooks'
import { softDelete } from '../../db/db'
import { fmtFullDate, minutesToHM } from '../../lib/dates'
import { courseMinutes, streakDays, weeklyTotal } from '../../lib/stats'
import { displayTime, elapsedMs, useTickingTimer, useTimer, type TimerMode } from './timer'

const PRESETS = [15, 25, 50, 90]

export function Focus() {
  const courses = useCourses()
  const sessions = useSessions()
  const timer = useTickingTimer()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (timer.lastSavedAt && !timer.running) {
      setNotice('Session complete. The minutes are yours.')
      const id = window.setTimeout(() => setNotice(null), 5000)
      return () => window.clearTimeout(id)
    }
  }, [timer.lastSavedAt, timer.running])

  const total = timer.durationMin * 60_000
  const progress = timer.mode === 'stopwatch'
    ? (elapsedMs(timer) % total) / total
    : 1 - Math.max(0, total - elapsedMs(timer)) / total
  const pct = Math.max(0, Math.min(1, progress))

  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? 'Unassigned'
  const byCourse = courseMinutes(sessions)
  const recent = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 15)

  async function finish() {
    const saved = await timer.stopAndSave()
    setNotice(saved ? `${saved.minutes} minutes kept. Added to your balance.` : 'Sessions under a minute are not saved.')
    window.setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="surface-ink fixed inset-0 z-40 overflow-y-auto" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mx-auto flex min-h-full max-w-[1000px] flex-col px-5 pb-16 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <button className="btn btn-quiet" onClick={() => navigate('/')}>
            <Icon name="close" size={16} /> Leave focus
          </button>
          <div className="data-sm" style={{ color: 'var(--text-3)' }}>MERIDIAN · NOW</div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="label mb-8" style={{ color: 'var(--accent)' }}>
            {timer.mode === 'focus' ? 'Focus' : timer.mode === 'break' ? 'Rest' : 'Elapsed'} · {courseName(timer.courseId)}
          </div>

          <div
            className="display tabular"
            style={{ fontSize: 'clamp(88px, 19vw, 220px)', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}
            aria-live="off"
          >
            {displayTime(timer)}
          </div>

          <div className="mt-10 w-full max-w-[640px]">
            <div className="h-[2px] w-full" style={{ background: 'var(--line)' }}>
              <div className="h-[2px]" style={{ width: `${pct * 100}%`, background: 'var(--accent)', transition: 'width 800ms linear' }} />
            </div>
            <div className="mt-3 flex justify-between">
              <span className="data-sm" style={{ color: 'var(--text-3)' }}>{minutesToHM(Math.round((elapsedMs(timer) / 60_000)))} kept</span>
              <span className="data-sm" style={{ color: 'var(--text-3)' }}>{timer.durationMin} min block</span>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {(['focus', 'break', 'stopwatch'] as TimerMode[]).map((mode) => (
              <button
                key={mode}
                className="btn btn-sm"
                data-active={timer.mode === mode}
                style={timer.mode === mode ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => { if (timer.running) timer.pause(); timer.setMode(mode) }}
              >
                {mode}
              </button>
            ))}
          </div>

          {timer.mode !== 'stopwatch' && !timer.running && timer.accumulatedMs === 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {PRESETS.map((p) => (
                <button key={p} className="btn btn-sm" style={timer.durationMin === p ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => timer.setDuration(p)}>
                  {p}m
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 w-full max-w-[320px]">
            <select className="select" value={timer.courseId ?? ''} onChange={(e) => timer.setCourse(e.target.value || null)}>
              <option value="">No course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {!timer.running ? (
              <button className="btn btn-primary px-10" onClick={() => timer.resumeOrStart()}>
                <Icon name="play" size={13} /> {timer.accumulatedMs > 0 ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button className="btn px-10" onClick={() => timer.pause()}><Icon name="pause" size={13} /> Pause</button>
            )}
            <button className="btn" disabled={timer.accumulatedMs === 0 && !timer.running} onClick={() => void finish()}><Icon name="stop" size={11} /> Save & stop</button>
            <button className="btn btn-quiet btn-icon" onClick={() => timer.reset()} aria-label="Reset"><Icon name="sync" size={15} /></button>
          </div>

          {notice && <div className="mt-6 text-[13px]" style={{ color: 'var(--accent)' }}>{notice}</div>}
          <p className="mt-8 max-w-sm text-[12px]" style={{ color: 'var(--text-3)' }}>
            Every saved minute goes into your attention balance. Distraction is a withdrawal.
          </p>
        </section>

        <div className="mt-12 grid gap-8 border-t pt-10 sm:grid-cols-3" style={{ borderColor: 'var(--line)' }}>
          <div><div className="display display-md">{streakDays(sessions)}</div><div className="label mt-2">day streak</div></div>
          <div><div className="display display-md">{minutesToHM(weeklyTotal(sessions))}</div><div className="label mt-2">this week</div></div>
          <div><div className="display display-md">{byCourse.size}</div><div className="label mt-2">courses in focus</div></div>
        </div>

        <section className="mt-14">
          <SectionLabel>Session history</SectionLabel>
          <div className="rule-list">
            {recent.map((s) => (
              <div key={s.id} className="rule-row">
                <span className="h-2 w-2" style={{ background: courses.find((c) => c.id === s.courseId)?.color ?? 'var(--text-3)' }} />
                <div className="row-primary">
                  <div className="row-title truncate">{courseName(s.courseId)}</div>
                  <div className="row-sub">{fmtFullDate(s.startedAt)} · {s.mode}</div>
                </div>
                <span className="data-sm">{s.minutes} min</span>
                <button className="btn btn-quiet btn-icon" onClick={() => setDeleting(s.id)} aria-label="Delete"><Icon name="trash" size={13} /></button>
              </div>
            ))}
            {!recent.length && <p className="muted py-8 text-[13px]">No sessions yet.</p>}
          </div>
        </section>
      </div>

      <Confirm open={deleting != null} onClose={() => setDeleting(null)} title="Delete session?" description="Your streak and balance will change." onConfirm={() => { if (deleting) void softDelete('sessions', deleting) }} />
    </div>
  )
}
