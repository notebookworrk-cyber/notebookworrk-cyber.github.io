import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { CourseDot, EmptyState, Modal, NowLine, SectionLabel } from '../../app/ui'
import { useAssessments, useCourses, useSessions, useTasks, useTopics, useUnlocks } from '../../db/hooks'
import { db } from '../../db/db'
import { touch, type Task } from '../../db/types'
import { dayKey, fmtTime, minutesToHM } from '../../lib/dates'
import { sessionsByDay, streakDays, weeklyTotal } from '../../lib/stats'
import { computeReadiness, nextAction } from '../../lib/readiness'
import { useTimer } from '../focus/timer'
import { TaskForm } from '../ledger/forms'

const HOUR_START = 7
const HOUR_END = 23
const HOUR_H = 38

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Today() {
  const courses = useCourses()
  const tasks = useTasks()
  const assessments = useAssessments()
  const topics = useTopics()
  const sessions = useSessions()
  const unlocks = useUnlocks()
  const navigate = useNavigate()
  const startTimer = useTimer((s) => s.start)
  const timer = useTimer()
  const [quickAdd, setQuickAdd] = useState(false)

  const readiness = useMemo(
    () => computeReadiness({ courses, topics, assessments, sessions }),
    [courses, topics, assessments, sessions],
  )
  const suggestion = useMemo(
    () => nextAction({ topics, assessments, courses, readiness }),
    [topics, assessments, courses, readiness],
  )

  const openTasks = tasks.filter((t) => !t.done).sort((a, b) => a.priority - b.priority || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
  const todayTasks = openTasks.filter((t) => t.dueAt != null && dayKey(t.dueAt) === dayKey())
  const todaySessions = sessions.filter((s) => s.startedAt >= new Date().setHours(0, 0, 0, 0) && s.deletedAt == null)
  const todayMinutes = sessionsByDay(sessions).get(dayKey()) ?? 0
  const weekMinutes = weeklyTotal(sessions)
  const streak = streakDays(sessions)
  const earned = sessions.reduce((s, x) => s + x.minutes, 0)
  const leaked = unlocks.reduce((s, x) => s + x.minutes, 0)
  const balance = earned - leaked

  const now = new Date()
  const nowTop = Math.max(0, Math.min((HOUR_END - HOUR_START) * HOUR_H, (now.getHours() + now.getMinutes() / 60 - HOUR_START) * HOUR_H))

  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? 'Unassigned'
  const courseColor = (id: string | null) => courses.find((c) => c.id === id)?.color ?? 'var(--text-3)'

  function startFocus() {
    const minutes = suggestion?.minutes ?? 25
    startTimer('focus', minutes, suggestion?.courseId ?? courses[0]?.id ?? null)
    navigate('/focus')
  }

  async function toggleTask(task: Task) {
    await db.tasks.put(touch({ ...task, done: task.done ? 0 : 1 }))
  }

  return (
    <div className="fade-in flex flex-col gap-10 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="display display-lg mt-4">{greeting()}.</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setQuickAdd(true)}><Icon name="plus" size={15} /> New task</button>
          <button className="btn btn-primary" onClick={startFocus}><Icon name="play" size={13} /> Focus</button>
        </div>
      </header>

      {/* NOW — the one action */}
      <section className="panel panel-pad relative overflow-hidden">
        <div className="mb-7 flex items-center gap-2 text-[12px]" style={{ color: 'var(--accent)' }}>
          <span className="inline-block h-[6px] w-[6px]" style={{ background: 'var(--accent)' }} />
          Now · {fmtTime(Date.now())}
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <h2 className="display display-lg break-words">
              {suggestion?.title ?? (openTasks[0]?.title ?? (courses.length ? 'Add a chapter to begin.' : 'Add your first course.'))}
            </h2>
            <div className="muted mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              {(suggestion || openTasks[0]) && (
                <>
                  <span className="flex items-center gap-2">
                    <CourseDot color={courseColor(suggestion?.courseId ?? openTasks[0]?.courseId ?? null)} />
                    {courseName(suggestion?.courseId ?? openTasks[0]?.courseId ?? null)}
                  </span>
                  <span>{suggestion?.minutes ?? openTasks[0]?.estimateMin ?? 25} min</span>
                  <span className="dim">{suggestion?.reason ?? 'Highest priority in your ledger'}</span>
                </>
              )}
            </div>
          </div>
          <button className="btn btn-primary shrink-0 px-7" onClick={startFocus}>
            Start {suggestion?.minutes ?? 25} minutes
          </button>
        </div>
        {timer.running && (
          <div className="mt-8">
            <ProgressLine value={Math.min(1, timer.accumulatedMs / (timer.durationMin * 60_000))} />
          </div>
        )}
        {!courses.length && (
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link className="btn" to="/plan">Add a course</Link>
            <span className="label">Everything starts with one course and one exam date.</span>
          </div>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* DAY SHEET */}
        <section>
          <SectionLabel right={<Link to="/plan" className="btn btn-quiet btn-sm">Open plan <Icon name="arrow" size={13} /></Link>}>
            Today · the day sheet
          </SectionLabel>
          <div className="relative" style={{ height: (HOUR_END - HOUR_START) * HOUR_H }}>
            {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => (
              <div key={i} className="absolute inset-x-0 flex items-start gap-4" style={{ top: i * HOUR_H }}>
                <span className="data-sm dim w-10 shrink-0 pt-[1px] text-right">{String(HOUR_START + i).padStart(2, '0')}:00</span>
                <div className="h-px flex-1" style={{ background: 'var(--line-soft)' }} />
              </div>
            ))}

            {/* blocks */}
            <div className="absolute inset-y-0 left-14 right-0">
              {todaySessions.map((s) => {
                const d = new Date(s.startedAt)
                const top = Math.max(0, (d.getHours() + d.getMinutes() / 60 - HOUR_START) * HOUR_H)
                const h = Math.max(20, (s.minutes / 60) * HOUR_H)
                return (
                  <div key={s.id} className="absolute left-0 right-0 overflow-hidden px-3 py-2" style={{ top, height: h, background: 'var(--surface-2)', borderLeft: `2px solid ${courseColor(s.courseId)}` }}>
                    <div className="text-[13px] font-medium truncate">{courseName(s.courseId)}</div>
                    <div className="data-sm dim">{fmtTime(s.startedAt)} · {s.minutes} min</div>
                  </div>
                )
              })}
              {todayTasks.map((t) => {
                const d = new Date(t.dueAt!)
                const top = Math.max(0, (d.getHours() + d.getMinutes() / 60 - HOUR_START) * HOUR_H)
                return (
                  <div key={t.id} className="absolute left-0 right-0 flex items-center gap-2 overflow-hidden px-3" style={{ top, height: 30, borderBottom: '1px solid var(--line)' }}>
                    <button onClick={() => void toggleTask(t)} aria-label="Complete" style={{ color: 'var(--text-3)' }}>
                      <Icon name="check" size={14} />
                    </button>
                    <span className="truncate text-[13px]">{t.title}</span>
                    <span className="data-sm dim ml-auto">{fmtTime(t.dueAt)}</span>
                  </div>
                )
              })}

              {/* the meridian */}
              <div className="pointer-events-none absolute inset-x-0" style={{ top: nowTop }}>
                <div className="now-line" />
                <span className="now-tag">{fmtTime(Date.now())}</span>
              </div>
            </div>
          </div>
          {!todaySessions.length && !todayTasks.length && (
            <p className="dim mt-5 text-[13px]">Nothing placed on today yet. Start a focus block and it will show up here.</p>
          )}
        </section>

        {/* RAIL */}
        <aside className="flex flex-col gap-9">
          <section>
            <SectionLabel>Readiness</SectionLabel>
            {readiness.length === 0 && <p className="muted text-[13px]">Add topics to a course to see how ready you are.</p>}
            <div className="rule-list">
              {readiness.slice(0, 4).map((r) => (
                <Link key={r.course.id} to="/progress" className="rule-row" style={{ textDecoration: 'none' }}>
                  <CourseDot color={r.course.color} />
                  <div className="row-primary">
                    <div className="row-title truncate">{r.course.name}</div>
                    <div className="row-sub">{r.examDays ? `Exam in ${r.examDays}d` : `${r.done}/${r.topics} chapters done`}</div>
                  </div>
                  <div className="text-right">
                    <div className="display display-sm">{r.low}–{r.high}</div>
                    <div className="data-sm dim">percent</div>
                  </div>
                </Link>
              ))}
            </div>
            {readiness.length > 0 && <Link to="/progress" className="btn btn-quiet btn-sm mt-4">All courses <Icon name="arrow" size={13} /></Link>}
          </section>

          <section>
            <SectionLabel>This week</SectionLabel>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <div className="display display-md">{minutesToHM(weekMinutes)}</div>
                <div className="label mt-1">in focus</div>
              </div>
              <div>
                <div className="display display-md">{streak}</div>
                <div className="label mt-1">day streak</div>
              </div>
              <div>
                <div className="display display-md">{todayMinutes}</div>
                <div className="label mt-1">minutes today</div>
              </div>
              <div>
                <div className="display display-md" style={{ color: balance >= 0 ? 'var(--positive)' : 'var(--accent)' }}>
                  {balance >= 0 ? '+' : '−'}{Math.abs(balance)}
                </div>
                <div className="label mt-1">attention</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <Modal open={quickAdd} onClose={() => setQuickAdd(false)} title="New task">
        <TaskForm courses={courses} onSave={() => setQuickAdd(false)} />
      </Modal>
    </div>
  )
}

function ProgressLine({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="now-line flex-1" style={{ background: 'var(--line)' }}>
        <div className="h-px line-draw" style={{ width: `${Math.min(100, value * 100)}%`, background: 'var(--accent)' }} />
      </div>
      <span className="data-sm" style={{ color: 'var(--accent)' }}>{Math.round(value * 100)}%</span>
    </div>
  )
}
