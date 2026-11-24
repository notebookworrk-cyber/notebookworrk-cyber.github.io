import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAssessments, useCourses, useSessions, useTasks, useTopics, useUnlocks } from '../../db/hooks'
import { minutesToHM } from '../../lib/dates'
import { computeReadiness, nextAction } from '../../lib/readiness'
import { streakDays } from '../../lib/stats'
import { displayTime, elapsedMs, useTimer } from '../focus/timer'
import { DIAL_MAX, DIAL_MIN, Dial } from './Dial'
import { soundOn, toggleSound } from './feedback'

interface RackItem {
  key: string
  title: string
  courseName: string
  courseId: string
  minutes: number
  gain: number
  isNext: boolean
}

export function Instrument() {
  const courses = useCourses()
  const tasks = useTasks()
  const assessments = useAssessments()
  const topics = useTopics()
  const sessions = useSessions()
  const unlocks = useUnlocks()

  const timer = useTimer()
  const setDuration = useTimer((s) => s.setDuration)
  const retime = useTimer((s) => s.retime)
  const start = useTimer((s) => s.start)
  const pause = useTimer((s) => s.pause)
  const resumeOrStart = useTimer((s) => s.resumeOrStart)
  const stopAndSave = useTimer((s) => s.stopAndSave)
  const lastSavedAt = useTimer((s) => s.lastSavedAt)

  const [sel, setSel] = useState(0)
  const [sound, setSound] = useState(soundOn)
  const [notice, setNotice] = useState<string | null>(null)
  const seenSaved = useRef(lastSavedAt)

  const readiness = useMemo(
    () => computeReadiness({ courses, topics, assessments, sessions }),
    [courses, topics, assessments, sessions],
  )
  const suggestion = useMemo(
    () => nextAction({ topics, assessments, courses, readiness }),
    [topics, assessments, courses, readiness],
  )

  const rack: RackItem[] = useMemo(() => {
    const fromTopics = readiness.flatMap((r) =>
      r.leverage.map((l) => ({
        key: l.topicId,
        title: l.title,
        courseName: r.course.code || r.course.name,
        courseId: l.courseId,
        minutes: l.minutes,
        gain: l.gain,
        isNext: suggestion?.title === `Study ${l.title}`,
        examDays: r.examDays ?? 999,
      })),
    )
    fromTopics.sort((a, b) => a.examDays - b.examDays || b.gain / b.minutes - a.gain / a.minutes)
    const top = fromTopics.slice(0, 3)
    if (top.length) return top
    return tasks.filter((t) => !t.done).slice(0, 3).map((t) => ({
      key: t.id,
      title: t.title,
      courseName: courses.find((c) => c.id === t.courseId)?.code || 'open task',
      courseId: t.courseId ?? '',
      minutes: t.estimateMin,
      gain: 0,
      isNext: false,
    }))
  }, [readiness, tasks, courses, suggestion])

  const current = rack[Math.min(sel, rack.length - 1)] ?? null
  const running = timer.running
  const engaged = running || timer.accumulatedMs > 0

  useEffect(() => {
    if (sel >= rack.length) setSel(0)
  }, [rack.length, sel])

  useEffect(() => {
    if (engaged || !current) return
    setDuration(Math.min(DIAL_MAX, Math.max(DIAL_MIN, current.minutes)))
    // Selection is the only trigger: turning the dial must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, engaged])

  useEffect(() => {
    if (!lastSavedAt || lastSavedAt === seenSaved.current) return
    seenSaved.current = lastSavedAt
    setNotice('minutes banked')
    const id = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(id)
  }, [lastSavedAt])

  const total = Math.max(1, timer.durationMin * 60_000)
  const left = Math.max(0, total - elapsedMs(timer))
  const minutes = Math.min(DIAL_MAX, Math.max(DIAL_MIN, timer.durationMin))
  const progress = engaged ? left / total : minutes / DIAL_MAX

  const display = engaged
    ? displayTime(timer)
    : String(timer.durationMin).padStart(2, '0')
  const caption = running ? 'left' : engaged ? 'paused' : 'min'
  const hint = running
    ? 'press to pause · hold to bank'
    : engaged
      ? 'press to resume · hold to bank'
      : 'turn to set · press to begin'

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    .toLowerCase()
  const exam = readiness[0]?.exam
  const examDays = readiness[0]?.examDays
  const examCourse = exam ? courses.find((c) => c.id === exam.courseId) : null
  const examLine = exam
    ? `${examCourse?.code || examCourse?.name || 'exam'} · ${examDays}d`
    : 'no exam set'
  const banked =
    sessions.reduce((s, x) => s + x.minutes, 0) - unlocks.reduce((s, x) => s + x.minutes, 0)
  const streak = streakDays(sessions)
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const todayBlocks = sessions.filter((s) => s.startedAt >= todayStart && s.deletedAt == null)
  const todayMin = todayBlocks.reduce((s, x) => s + x.minutes, 0)

  function turn(next: number) {
    if (engaged) retime(next)
    else setDuration(next)
  }

  function press() {
    const s = useTimer.getState()
    if (s.running) {
      pause()
    } else if (s.accumulatedMs > 0) {
      resumeOrStart()
    } else {
      start('focus', Math.max(DIAL_MIN, s.durationMin), current?.courseId ?? courses[0]?.id ?? null)
    }
  }

  function hold() {
    void stopAndSave()
  }

  return (
    <div className={`instrument-surface${engaged ? ' is-engaged' : ''}`}>
      <div className="instrument-wrap">
        <header className="instrument-head">
          <div className="instrument-wordmark">
            <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden="true">
              <path d="M7 1v20" stroke="currentColor" strokeWidth="1" opacity=".45" />
              <circle cx="7" cy="15" r="2.6" fill="currentColor" />
            </svg>
            <span>meridian</span>
          </div>
          <button
            className="etch etch-dim instrument-sound"
            onClick={() => setSound(toggleSound())}
            aria-label="Toggle dial sound"
          >
            {sound ? 'sound on' : 'sound off'}
          </button>
        </header>

        <div className="instrument-strip">
          <span className="etch">{dateLabel}</span>
          <span className="etch etch-live">{examLine}</span>
          <span className="etch etch-dim">{streak}d streak · {minutesToHM(banked)}</span>
        </div>

        <div className="instrument-stage">
          <Dial
            minutes={minutes}
            progress={progress}
            active={engaged}
            display={display}
            caption={caption}
            onTurn={turn}
            onPress={press}
            onHold={hold}
          />

          <div className="instrument-chapter">
            {current ? (
              <button
                className="chapter-title"
                onClick={() => setSel((sel + 1) % rack.length)}
                title="Cycle through chapters"
              >
                {current.title}
              </button>
            ) : (
              <Link to="/plan" className="chapter-title">load a chapter</Link>
            )}
            <div className="etch etch-dim chapter-meta">
              {current
                ? `${current.courseName}${current.gain ? ` · +${current.gain}% in ${current.minutes}m` : ` · ${current.minutes}m`}${current.isNext ? ' · next' : ''}`
                : 'add one in plan to give the dial a purpose'}
            </div>
          </div>

          <div className="instrument-rack">
            {rack.map((item, i) => (
              <button
                key={item.key}
                className={`rack-line${i === sel ? ' is-selected' : ''}`}
                onClick={() => setSel(i)}
                aria-pressed={i === sel}
              >
                <span className="rack-mark">{i === sel ? '▸' : '·'}</span>
                <span className="rack-name">{item.title}</span>
                <span className="rack-gain">{item.gain ? `+${item.gain}%` : `${item.minutes}m`}</span>
              </button>
            ))}
          </div>

          <div className="etch etch-dim instrument-hint">{notice ?? hint}</div>
          <div className="etch etch-dim instrument-today">
            today · {todayBlocks.length} block{todayBlocks.length === 1 ? '' : 's'} · {todayMin}m
          </div>
        </div>

        <footer className="instrument-rail">
          <Link to="/plan">plan</Link>
          <Link to="/progress">progress</Link>
          <Link to="/block?app=instagram">shield</Link>
          <Link to="/settings">settings</Link>
        </footer>
      </div>
    </div>
  )
}
