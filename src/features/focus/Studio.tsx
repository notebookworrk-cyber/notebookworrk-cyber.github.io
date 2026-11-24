import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { SectionLabel } from '../../app/ui'
import { useCourses, useSessions, useTopics } from '../../db/hooks'
import { softDelete } from '../../db/db'
import { fmtFullDate, minutesToHM } from '../../lib/dates'
import { courseMinutes, streakDays, weeklyTotal } from '../../lib/stats'
import { AudioPanel } from '../audio/AudioPanel'
import { RecoveryDialog } from './RecoveryDialog'
import { useWakeLock } from './wakeLock'
import { displayTime, elapsedMs, useTickingTimer, useTimer, type TimerMode } from './timer'

const PRESETS = [15, 25, 35, 50, 90]
const MODES: TimerMode[] = ['focus', 'break', 'stopwatch']

export function FocusStudio() {
  const courses = useCourses()
  const topics = useTopics()
  const sessions = useSessions()
  const timer = useTickingTimer()
  const navigate = useNavigate()
  const wake = useWakeLock(timer.running)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [immersive, setImmersive] = useState(false)
  const [reflecting, setReflecting] = useState(false)
  const [difficulty, setDifficulty] = useState(2)
  const [confidence, setConfidence] = useState(3)
  const [deleting, setDeleting] = useState<string | null>(null)

  const total = Math.max(1, timer.durationMin * 60_000)
  const elapsed = elapsedMs(timer)
  const progress = timer.mode === 'stopwatch'
    ? (elapsed % total) / total
    : 1 - Math.max(0, total - elapsed) / total
  const pct = Math.max(0, Math.min(1, progress))
  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? 'Unassigned'
  const ownTopics = useMemo(
    () => topics.filter((t) => !timer.courseId || t.courseId === timer.courseId),
    [topics, timer.courseId],
  )
  const byCourse = courseMinutes(sessions)
  const recent = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 12)

  useEffect(() => {
    if (!timer.lastSavedAt || timer.running) return
    setNotice('Session saved. The minutes are yours.')
    const id = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(id)
  }, [timer.lastSavedAt, timer.running])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        if (timer.running) timer.pause()
        else timer.resumeOrStart()
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        notesRef.current?.focus()
      } else if (e.key === 'Escape') {
        setImmersive(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [timer])

  async function finish(skipReflection = false) {
    if (!skipReflection && elapsed >= 60_000) {
      setReflecting(true)
      return
    }
    const saved = await timer.stopAndSave()
    setReflecting(false)
    setNotice(saved ? `${saved.minutes} minutes kept.` : 'Sessions under a minute are not saved.')
    window.setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="surface-ink studio" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <RecoveryDialog />
      <header className="studio-head">
        <button className="btn btn-quiet" onClick={() => navigate('/')}><Icon name="close" size={16} /> Leave focus</button>
        <div className="data-sm" style={{ color: 'var(--text-3)' }}>MERIDIAN · FOCUS STUDIO</div>
        <div className="flex items-center gap-2">
          {wake.supported && (
            <button className="btn btn-sm" onClick={() => wake.setEnabled(!wake.enabled)} aria-pressed={wake.enabled && wake.locked}>
              Keep awake · {wake.enabled ? (wake.locked ? 'on' : 'ready') : 'off'}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setImmersive((v) => !v)}>{immersive ? 'Show panels' : 'Immersive'}</button>
        </div>
      </header>

      <div className={`studio-grid${immersive ? ' is-immersive' : ''}`}>
        {/* LEFT — the timer */}
        <section className="studio-timer">
          <div className="label" style={{ color: 'var(--accent)' }}>
            {timer.mode === 'focus' ? 'Focus' : timer.mode === 'break' ? 'Rest' : 'Elapsed'} · {courseName(timer.courseId)}
          </div>
          <div className="studio-time tabular" aria-live="off">{displayTime(timer)}</div>
          <div className="studio-bar">
            <div style={{ width: `${pct * 100}%`, background: 'var(--accent)' }} />
          </div>
          <div className="mt-4 flex w-full justify-between">
            <span className="data-sm" style={{ color: 'var(--text-3)' }}>{minutesToHM(Math.round(elapsed / 60_000))} kept</span>
            <span className="data-sm" style={{ color: 'var(--text-3)' }}>{timer.durationMin} min block</span>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {MODES.map((mode) => (
              <button key={mode} className="btn btn-sm" data-active={timer.mode === mode} style={timer.mode === mode ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => { if (timer.running) timer.pause(); timer.setMode(mode) }}>
                {mode}
              </button>
            ))}
          </div>

          {!timer.running && timer.accumulatedMs === 0 && timer.mode !== 'stopwatch' && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {PRESETS.map((p) => (
                <button key={p} className="btn btn-sm" data-active={timer.durationMin === p} style={timer.durationMin === p ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => timer.setDuration(p)}>{p}m</button>
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {!timer.running ? (
              <button className="btn btn-primary px-10" onClick={() => timer.resumeOrStart()}>
                <Icon name="play" size={13} /> {timer.accumulatedMs > 0 ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button className="btn px-10" onClick={() => timer.pause()}><Icon name="pause" size={13} /> Pause</button>
            )}
            <button className="btn" disabled={timer.accumulatedMs === 0 && !timer.running} onClick={() => void finish()}><Icon name="stop" size={11} /> Finish</button>
            <button className="btn btn-quiet btn-icon" onClick={() => timer.reset()} aria-label="Reset"><Icon name="sync" size={15} /></button>
          </div>
          {notice && <div className="mt-6 text-[13px]" style={{ color: 'var(--accent)' }}>{notice}</div>}
          <p className="mt-8 max-w-sm text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
            Space to start or pause · N for notes · every saved minute goes into your balance.
          </p>
        </section>

        {/* CENTRE — what you are studying */}
        {!immersive && (
          <section className="studio-context">
            <SectionLabel>This session</SectionLabel>
            <div className="field">
              <label>Course</label>
              <select className="select" value={timer.courseId ?? ''} onChange={(e) => { timer.setCourse(e.target.value || null); timer.setTopic(null, '') }}>
                <option value="">No course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field mt-5">
              <label>Chapter</label>
              <select className="select" value={timer.topicId ?? ''} onChange={(e) => {
                const t = topics.find((x) => x.id === e.target.value)
                timer.setTopic(e.target.value || null, t?.title ?? '')
                if (t) timer.setDuration(Math.max(15, t.estimateMin ?? Math.min(60, timer.durationMin)))
              }}>
                <option value="">No chapter</option>
                {ownTopics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div className="field mt-5">
              <label>Quick notes</label>
              <textarea ref={notesRef} className="textarea min-h-[160px]" value={timer.note} onChange={(e) => timer.setNote(e.target.value)} placeholder="What are you working on? What is hard?" />
            </div>

            {reflecting && (
              <div className="reflection mt-7">
                <div className="label">Optional reflection</div>
                <p className="muted mt-2 text-[12px]">Ten seconds. It makes revision useful later.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['easy', 'steady', 'hard', 'lost'].map((label, i) => (
                    <button key={label} className="btn btn-sm" data-active={difficulty === i} style={difficulty === i ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setDifficulty(i)}>{label}</button>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className="btn btn-sm" data-active={confidence === n} style={confidence === n ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setConfidence(n)}>{n}</button>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => { timer.setReflection(timer.note, difficulty, confidence); void finish(true) }}>Save session</button>
                  <button className="btn btn-quiet" onClick={() => void finish(true)}>Skip</button>
                </div>
              </div>
            )}

            <div className="mt-10 grid grid-cols-3 gap-4 border-t pt-6" style={{ borderColor: 'var(--line)' }}>
              <div><div className="display display-md">{streakDays(sessions)}</div><div className="label mt-2">streak</div></div>
              <div><div className="display display-md">{minutesToHM(weeklyTotal(sessions))}</div><div className="label mt-2">week</div></div>
              <div><div className="display display-md">{byCourse.size}</div><div className="label mt-2">courses</div></div>
            </div>
          </section>
        )}

        {/* RIGHT — audio and history */}
        {!immersive && (
          <aside className="studio-side">
            <AudioPanel />
            <SectionLabel>Session history</SectionLabel>
            <div className="rule-list">
              {recent.map((s) => (
                <div key={s.id} className="rule-row" style={{ padding: '10px 0' }}>
                  <span className="h-2 w-2" style={{ background: courses.find((c) => c.id === s.courseId)?.color ?? 'var(--text-3)' }} />
                  <div className="row-primary">
                    <div className="row-title truncate text-[13px]">{courseName(s.courseId)}</div>
                    <div className="row-sub">{fmtFullDate(s.startedAt)} · {s.mode}</div>
                  </div>
                  <span className="data-sm">{s.minutes} min</span>
                  <button className="btn btn-quiet btn-icon" onClick={() => setDeleting(s.id)} aria-label="Delete"><Icon name="trash" size={13} /></button>
                </div>
              ))}
              {!recent.length && <p className="muted py-6 text-[13px]">No sessions yet.</p>}
            </div>
          </aside>
        )}
      </div>

      {deleting && (
        <div className="recovery-overlay" role="dialog" aria-modal="true" aria-label="Delete session">
          <div className="recovery-card">
            <h2 className="display display-sm">Delete this session?</h2>
            <p className="muted mt-4 text-[13px]">Your streak and balance will change.</p>
            <div className="mt-7 flex gap-2">
              <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { void softDelete('sessions', deleting); setDeleting(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
