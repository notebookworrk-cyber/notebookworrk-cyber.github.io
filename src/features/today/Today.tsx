import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { CourseDot, EmptyState, Modal, SectionLabel } from '../../app/ui'
import {
  useAssessments,
  useCommitments,
  useCourses,
  useRecalls,
  useSessions,
  useSetting,
  useTasks,
  useTopics,
  useUnlocks,
} from '../../db/hooks'
import { db } from '../../db/db'
import { touch, type Task } from '../../db/types'
import { dayKey, fmtMinutes, fmtTime, minutesToHM } from '../../lib/dates'
import { consistency, sessionsByDay, streakDays, subjectBalance, weeklyTotal } from '../../lib/stats'
import { computeReadiness, nextAction } from '../../lib/readiness'
import { buildReviewQueue } from '../../lib/recall'
import { useTimer } from '../focus/timer'
import { TaskForm } from '../ledger/forms'

const START = 7
const END = 23
const H = 40

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
  const recalls = useRecalls()
  const commitments = useCommitments()
  const dailyGoal = Number(useSetting('dailyGoal', '120')) || 120
  const navigate = useNavigate()
  const startTimer = useTimer((s) => s.start)
  const timer = useTimer()
  const [quickAdd, setQuickAdd] = useState(false)

  const readiness = useMemo(
    () => computeReadiness({ courses, topics, assessments, sessions, recalls }),
    [courses, topics, assessments, sessions, recalls],
  )
  const suggestion = useMemo(
    () => nextAction({ topics, assessments, courses, readiness }),
    [topics, assessments, courses, readiness],
  )
  const reviews = useMemo(
    () => buildReviewQueue({ topics, recalls, assessments, courses }).slice(0, 4),
    [topics, recalls, assessments, courses],
  )

  const nameOf = (id: string | null) => courses.find((c) => c.id === id)?.name ?? 'Unassigned'
  const colorOf = (id: string | null) => courses.find((c) => c.id === id)?.color ?? 'var(--text-3)'

  const openTasks = tasks
    .filter((t) => t.done === 0)
    .sort((a, b) => a.priority - b.priority || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
  const todayTasks = openTasks.filter((t) => t.dueAt != null && dayKey(t.dueAt) === dayKey())
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const todaySessions = sessions.filter((s) => s.startedAt >= todayStart && s.mode !== 'break')
  const todayMinutes = sessionsByDay(sessions).get(dayKey()) ?? 0
  const weekMinutes = weeklyTotal(sessions)
  const streak = streakDays(sessions)
  const consistent = consistency(sessions)
  const earned = sessions.filter((s) => s.mode !== 'break').reduce((s, x) => s + x.minutes, 0)
  const leaked = unlocks.reduce((s, x) => s + x.minutes, 0)
  const balance = earned - leaked
  const imbalance = subjectBalance(sessions, courses)

  const now = new Date()
  const nowTop = Math.max(0, Math.min((END - START) * H, (now.getHours() + now.getMinutes() / 60 - START) * H))

  function startFocus() {
    const minutes = suggestion?.minutes ?? 25
    startTimer('focus', minutes, suggestion?.courseId ?? courses[0]?.id ?? null, suggestion?.topicId ?? null, suggestion?.title ?? '')
    navigate('/instrument')
  }

  async function toggleTask(task: Task) {
    await db.tasks.put(touch({ ...task, done: task.done ? 0 : 1 }))
  }

  const target = suggestion?.title ?? openTasks[0]?.title
  const suggestedCourse = suggestion?.courseId ?? openTasks[0]?.courseId ?? null

  return (
    <div className="fade-in flex flex-col gap-12 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="display display-lg mt-4">{greeting()}.</h1>
          <p className="muted mt-4 max-w-xl text-[14px]">
            {todayMinutes} of {dailyGoal} focus minutes today. {consistent.activeDays} active days in the last four weeks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => setQuickAdd(true)}><Icon name="plus" size={15} /> Quick capture</button>
          <button className="btn" onClick={() => navigate('/plan?rescue=1')}><Icon name="reset" size={15} /> Rescue my day</button>
          <button className="btn btn-primary" onClick={startFocus}><Icon name="play" size={13} /> Focus now</button>
        </div>
      </header>

      {/* THE NEXT MOVE — one action, with its reason */}
      <section className="next-move">
        <div className="next-move-head">
          <span className="signal-dot" />
          <span>Now · {fmtTime(Date.now())}</span>
          <span className="next-move-dial">one move</span>
        </div>
        <div className="next-move-body">
          <div className="min-w-0">
            <div className="label">{suggestion ? `Study · ${nameOf(suggestedCourse)}` : 'The next useful thing'}</div>
            <h2 className="next-move-title">{target ?? (courses.length ? 'Add a chapter to begin.' : 'Add your first course.')}</h2>
            <div className="muted mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
              {(suggestion || openTasks[0]) && (
                <>
                  <span className="flex items-center gap-2"><CourseDot color={colorOf(suggestedCourse)} />{nameOf(suggestedCourse)}</span>
                  <span>{suggestion?.minutes ?? openTasks[0]?.estimateMin ?? 25} min</span>
                </>
              )}
              <span>{suggestion?.reason ?? (openTasks[0] ? 'Highest priority in your ledger' : 'Rebuild the week to find a starting point')}</span>
            </div>
            {timer.running && (
              <div className="live-progress">
                <div className="live-progress-fill" style={{ width: `${Math.min(100, (timer.accumulatedMs / (timer.durationMin * 60_000)) * 100)}%` }} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2">
            <button className="btn btn-primary px-7" onClick={startFocus}>
              {timer.running ? 'Open the dial' : `Start ${suggestion?.minutes ?? 25} minutes`} <Icon name="arrow" size={14} />
            </button>
            <Link className="btn btn-quiet justify-center" to="/instrument">Adjust on the dial</Link>
          </div>
        </div>
        {!courses.length && (
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link className="btn" to="/plan?add=course">Add a course</Link>
            <span className="label">Everything starts with one course and one exam date.</span>
          </div>
        )}
      </section>

      <div className="editorial-grid">
        {/* THE DAY SHEET */}
        <section className="min-w-0">
          <SectionLabel right={<Link to="/plan" className="btn btn-quiet btn-sm">Open plan <Icon name="arrow" size={13} /></Link>}>
            Today · the day sheet
          </SectionLabel>
          <div className="day-sheet" style={{ height: (END - START) * H }}>
            {Array.from({ length: END - START + 1 }, (_, i) => (
              <div key={i} className="day-hour" style={{ top: i * H }}>
                <span className="data-sm dim w-11 shrink-0 pt-[1px] text-right">{String(START + i).padStart(2, '0')}:00</span>
                <div className="h-px flex-1" style={{ background: 'var(--line-soft)' }} />
              </div>
            ))}
            <div className="day-content">
              {commitments
                .filter((c) => c.days.includes(now.getDay()))
                .map((c) => (
                  <div key={c.id} className="day-block day-fixed" style={{ top: (c.startMin - START * 60) / 60 * H, height: Math.max(22, ((c.endMin - c.startMin) / 60) * H) }}>
                    <div className="text-[13px] font-medium truncate">{c.title}</div>
                    <div className="data-sm dim">{fmtMinutes(c.startMin)} · fixed</div>
                  </div>
                ))}
              {todaySessions.map((s) => {
                const d = new Date(s.startedAt)
                const top = Math.max(0, (d.getHours() + d.getMinutes() / 60 - START) * H)
                return (
                  <div key={s.id} className="day-block" style={{ top, height: Math.max(24, (s.minutes / 60) * H), borderLeftColor: colorOf(s.courseId) }}>
                    <div className="text-[13px] font-medium truncate">{nameOf(s.courseId)}</div>
                    <div className="data-sm dim">{fmtTime(s.startedAt)} · {s.minutes} min</div>
                  </div>
                )
              })}
              {todayTasks.map((t) => {
                const d = new Date(t.dueAt!)
                const top = Math.max(0, (d.getHours() + d.getMinutes() / 60 - START) * H)
                return (
                  <div key={t.id} className="day-task" style={{ top, borderLeftColor: colorOf(t.courseId) }}>
                    <button onClick={() => void toggleTask(t)} aria-label="Complete" className="dim"><Icon name="check" size={14} /></button>
                    <span className="truncate text-[13px]">{t.title}</span>
                    <span className="data-sm dim ml-auto">{fmtTime(t.dueAt)}</span>
                  </div>
                )
              })}
              <div className="day-now" style={{ top: nowTop }}>
                <div className="now-line" />
                <span className="now-tag">{fmtTime(Date.now())}</span>
              </div>
            </div>
          </div>
          {!todaySessions.length && !todayTasks.length && !commitments.length && (
            <EmptyState
              icon="calendar"
              title="Today is open."
              hint="Place a task in Plan, or let Rescue My Day build a realistic version of what remains."
              action={<button className="btn" onClick={() => navigate('/plan?rescue=1')}>Rescue my day</button>}
            />
          )}
        </section>

        {/* RAIL */}
        <aside className="flex flex-col gap-12">
          <section>
            <SectionLabel right={<Link to="/review" className="btn btn-quiet btn-sm">Review <Icon name="arrow" size={13} /></Link>}>
              Revision due
            </SectionLabel>
            {reviews.length ? (
              <div className="rule-list">
                {reviews.map((r) => (
                  <Link key={r.topic.id} to={`/review?topic=${r.topic.id}`} className="rule-row" style={{ textDecoration: 'none' }}>
                    <CourseDot color={r.course?.color ?? 'var(--text-3)'} />
                    <div className="row-primary">
                      <div className="row-title truncate">{r.topic.title}</div>
                      <div className="row-sub">{r.reason}</div>
                    </div>
                    <Icon name="chevron" size={14} className="dim" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted text-[13px]">Nothing due. Finish a chapter to start its recall loop.</p>
            )}
          </section>

          <section>
            <SectionLabel>Readiness</SectionLabel>
            {readiness.length === 0 && <p className="muted text-[13px]">Add topics to a course to see how ready you are.</p>}
            <div className="rule-list">
              {readiness.slice(0, 4).map((r) => (
                <Link key={r.course.id} to="/progress" className="rule-row" style={{ textDecoration: 'none' }}>
                  <CourseDot color={r.course.color} />
                  <div className="row-primary">
                    <div className="row-title truncate">{r.course.name}</div>
                    <div className="row-sub">{r.examDays ? `Exam in ${r.examDays}d` : `${r.done}/${r.topics} chapters done`} · {r.confidenceLabel} evidence</div>
                  </div>
                  <div className="text-right">
                    <div className="display display-sm">{r.low}–{r.high}</div>
                    <div className="data-sm dim">percent</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel>The ledger</SectionLabel>
            <div className="ledger-grid">
              <div><div className="display display-md">{minutesToHM(weekMinutes)}</div><div className="label mt-1">this week</div></div>
              <div><div className="display display-md">{streak}</div><div className="label mt-1">day streak</div></div>
              <div><div className="display display-md">{todayMinutes}</div><div className="label mt-1">minutes today</div></div>
              <div><div className="display display-md" style={{ color: balance >= 0 ? 'var(--positive)' : 'var(--accent)' }}>{balance >= 0 ? '+' : '−'}{Math.abs(balance)}</div><div className="label mt-1">attention</div></div>
            </div>
            {imbalance && (
              <p className="dim mt-6 text-[12px]">{imbalance.name} has taken {imbalance.percent}% of recent attention. That may be right — worth a glance.</p>
            )}
          </section>
        </aside>
      </div>

      <Modal open={quickAdd} onClose={() => setQuickAdd(false)} title="Quick capture">
        <TaskForm courses={courses} onSave={() => setQuickAdd(false)} />
      </Modal>
    </div>
  )
}
