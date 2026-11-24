import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { Confirm, EmptyState, Modal, PageHeader, SectionLabel, Segmented } from '../../app/ui'
import { useAssessments, useCommitments, useCourses, useRecalls, useSessions, useSetting, useTasks, useTopics } from '../../db/hooks'
import { db, softDelete } from '../../db/db'
import { stamp, touch, uid, type Assessment, type Commitment, type CommitmentKind, type Course, type Task, type Topic } from '../../db/types'
import { addDays, dayKey, fmtMinutes, fmtTime, fromLocalInput, startOfWeek, toLocalInput } from '../../lib/dates'
import { AssessmentForm, CommitmentForm, CourseForm, TaskForm, TopicForm } from '../ledger/forms'
import {
  availableMinutesToday,
  buildSchedule,
  rescueDay,
  type RescueResult,
  type SchedulePreview,
} from '../../lib/scheduler'

type Tab = 'week' | 'backlog' | 'courses' | 'commitments'
const START = 7
const END = 23
const H = 30
const KINDS: CommitmentKind[] = ['class', 'coaching', 'work', 'personal', 'break', 'travel']

export function Plan() {
  const courses = useCourses()
  const tasks = useTasks()
  const assessments = useAssessments()
  const topics = useTopics()
  const sessions = useSessions()
  const recalls = useRecalls()
  const commitments = useCommitments()
  const defaultHorizon = Number(useSetting('resetHorizon', '14')) || 14
  const defaultHours = Number(useSetting('resetHours', '2')) || 2
  const [params, setParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>('week')
  const [anchor, setAnchor] = useState(0)
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7)
  const [scheduleDay, setScheduleDay] = useState<number | null>(null)
  const [rebuild, setRebuild] = useState(false)
  const [rescue, setRescue] = useState(false)
  const [horizon, setHorizon] = useState(defaultHorizon)
  const [hours, setHours] = useState(defaultHours)
  const [intensity, setIntensity] = useState(0.8)
  const [preferred, setPreferred] = useState('')
  const [revisionWeight, setRevisionWeight] = useState(0.5)
  const [built, setBuilt] = useState<SchedulePreview | null>(null)
  const [rescueResult, setRescueResult] = useState<RescueResult | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null)
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null)
  const [deleting, setDeleting] = useState<{ table: 'tasks' | 'courses' | 'topics' | 'assessments' | 'commitments'; id: string } | null>(null)
  const [newCourse, setNewCourse] = useState(false)
  const [newTopic, setNewTopic] = useState(false)
  const [newExam, setNewExam] = useState(false)
  const [newCommitment, setNewCommitment] = useState(false)

  useEffect(() => {
    const intent = params.get('add')
    if (intent === 'course') setNewCourse(true)
    if (intent === 'chapter') setNewTopic(true)
    if (intent === 'task') setEditingTask({ ...blankTask(), courseId: courses[0]?.id ?? null })
    if (params.get('rescue') === '1') { openRescue(); setTab('week') }
    if (params.get('rebuild') === '1') { setRebuild(true); setTab('week') }
    if (intent || params.has('rescue') || params.has('rebuild')) setParams({}, { replace: true })
    // One-shot deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const week = useMemo(() => {
    const start = addDays(startOfWeek(), anchor * 7)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchor])

  const weekStart = week[0].getTime()
  const weekEnd = week[6].getTime() + 86_400_000
  const weekTasks = tasks.filter((t) => t.dueAt != null && t.dueAt >= weekStart && t.dueAt < weekEnd)
  const weekSessions = sessions.filter((s) => s.startedAt >= weekStart && s.startedAt < weekEnd && s.deletedAt == null)
  const weekExams = assessments.filter((a) => a.dueAt != null && a.dueAt >= weekStart && a.dueAt < weekEnd)

  const nameOf = (id: string | null) => courses.find((c) => c.id === id)?.name ?? 'Unassigned'
  const colorOf = (id: string | null) => courses.find((c) => c.id === id)?.color ?? 'var(--text-3)'

  function schedulerInput(dayCount = horizon, dayMinutes = hours * 60, strength = intensity) {
    return {
      now: Date.now(),
      topics, tasks, assessments, courses, commitments, sessions, recalls,
      horizonDays: dayCount,
      minutesPerDay: dayMinutes,
      intensity: strength,
      preferredCourseIds: preferred ? [preferred] : undefined,
      revisionWeight,
    }
  }

  function makePlan() {
    setBuilt(buildSchedule(schedulerInput()))
  }

  function openRescue() {
    setRescueResult(rescueDay(schedulerInput(1, availableMinutesToday({ commitments }) / 60 || hours, 1)))
    setRescue(true)
  }

  async function applySchedule(preview: SchedulePreview, source: string) {
    const previous = tasks.filter((t) => t.source === source)
    for (const t of previous) await softDelete('tasks', t.id)
    for (const b of preview.blocks) {
      const due = new Date()
      due.setDate(due.getDate() + b.day)
      due.setHours(Math.floor(b.startMin / 60), b.startMin % 60, 0, 0)
      await db.tasks.add(stamp({
        id: uid(),
        title: b.kind === 'revision' ? `Revise ${b.title}` : b.kind === 'task' ? b.title : `Study ${b.title}`,
        courseId: b.courseId,
        topicId: b.topicId,
        dueAt: due.getTime(),
        priority: 2,
        estimateMin: b.minutes,
        done: 0,
        note: b.reason,
        source,
        planId: source,
      }))
    }
    setRebuild(false)
    setRescue(false)
    setBuilt(null)
    setRescueResult(null)
    setAnchor(0)
    setTab('week')
  }

  async function quickSchedule(title: string, day: Date, time: string, minutes: number, courseId: string) {
    await db.tasks.add(stamp({
      id: uid(), title, courseId: courseId || null,
      dueAt: fromLocalInput(`${dayKey(day)}T${time}`),
      priority: 2, estimateMin: minutes, done: 0, note: '', source: 'manual',
    }))
    setScheduleDay(null)
  }

  function eventsFor(date: Date) {
    const key = dayKey(date)
    const dayIdx = date.getDay()
    return [
      ...commitments.filter((c) => c.days.includes(dayIdx)).map((c) => ({
        id: c.id, at: c.startMin * 60_000, minutes: c.endMin - c.startMin,
        title: c.title, sub: `${fmtMinutes(c.startMin)} · fixed`, color: 'var(--accent)', kind: 'fixed' as const,
      })),
      ...weekSessions.filter((s) => dayKey(s.startedAt) === key).map((s) => ({
        id: s.id, at: s.startedAt, minutes: s.minutes,
        title: nameOf(s.courseId), sub: `${s.minutes} min`, color: colorOf(s.courseId), kind: 'session' as const,
      })),
      ...weekTasks.filter((t) => dayKey(t.dueAt!) === key).map((t) => ({
        id: t.id, at: t.dueAt!, minutes: t.estimateMin,
        title: t.title, sub: t.done ? 'Done' : `${t.estimateMin} min`, color: colorOf(t.courseId), kind: 'task' as const, done: t.done,
      })),
      ...weekExams.filter((a) => dayKey(a.dueAt!) === key).map((a) => ({
        id: a.id, at: a.dueAt!, minutes: 60,
        title: a.title, sub: a.kind, color: 'var(--accent)', kind: 'exam' as const,
      })),
    ]
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Plan · time, made visible"
        title="The week, honestly."
        subtitle="Place work inside the time you actually have. Fixed commitments are barriers, not suggestions."
        actions={
          <>
            <Segmented
              value={tab}
              options={[{ value: 'week', label: 'Week' }, { value: 'backlog', label: 'Backlog' }, { value: 'courses', label: 'Courses' }, { value: 'commitments', label: 'Fixed' }]}
              onChange={setTab}
            />
            <button className="btn" onClick={openRescue}><Icon name="reset" size={15} /> Rescue my day</button>
            <button className="btn btn-primary" onClick={() => setRebuild(true)}><Icon name="sync" size={15} /> Rebuild</button>
          </>
        }
      />

      {tab === 'week' && (
        <section className="mt-12">
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <button className="btn btn-icon btn-quiet shrink-0" onClick={() => setAnchor((a) => a - 1)} aria-label="Previous week"><Icon name="chevron" size={16} className="-rotate-90" /></button>
              <div className="min-w-0 flex-1 truncate text-center text-[15px] font-medium sm:text-[20px]">
                {week[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {week[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
              <button className="btn btn-icon btn-quiet shrink-0" onClick={() => setAnchor((a) => a + 1)} aria-label="Next week"><Icon name="chevron" size={16} /></button>
            </div>
            <button className="btn btn-quiet btn-sm hidden shrink-0 sm:inline-flex" onClick={() => { setAnchor(0); setSelectedDay((new Date().getDay() + 6) % 7) }}>This week</button>
          </div>

          <div className="mb-4 grid grid-cols-7 gap-1 md:hidden">
            {week.map((day, i) => (
              <button key={dayKey(day)} onClick={() => setSelectedDay(i)} className="py-2 text-center" style={{ borderBottom: `2px solid ${selectedDay === i ? 'var(--accent)' : 'var(--line)'}` }}>
                <div className="data-sm dim">{day.toLocaleDateString(undefined, { weekday: 'narrow' })}</div>
                <div className="display display-sm mt-1">{day.getDate()}</div>
              </button>
            ))}
          </div>

          <div className="week-grid">
            {week.map((day, dayIdx) => {
              const isToday = dayKey(day) === dayKey()
              const events = eventsFor(day)
              const topNow = isToday
                ? Math.max(0, Math.min((END - START) * H, (new Date().getHours() + new Date().getMinutes() / 60 - START) * H))
                : null
              return (
                <div key={dayKey(day)} className={dayIdx === selectedDay ? '' : 'hidden md:block'} style={{ background: 'var(--bg)' }}>
                  <div className="flex items-center justify-between px-2 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                    <div>
                      <div className="data-sm dim">{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                      <div className="display display-sm mt-1">{day.getDate()}</div>
                    </div>
                    <button className="btn btn-quiet btn-icon" style={{ minWidth: 28, padding: 4 }} onClick={() => setScheduleDay(anchor * 7 + dayIdx)} aria-label={`Add to ${dayKey(day)}`}><Icon name="plus" size={14} /></button>
                  </div>
                  <div className="relative" style={{ height: (END - START) * H }}>
                    {Array.from({ length: END - START }, (_, i) => (
                      <div key={i} className="absolute inset-x-0 h-px" style={{ top: i * H, background: 'var(--line-soft)' }} />
                    ))}
                    {events.map((e) => {
                      const d = new Date(e.at)
                      const at = e.kind === 'fixed' ? e.at / 60_000 : d.getHours() + d.getMinutes() / 60
                      const top = Math.max(0, (at - START) * H)
                      const h = Math.max(18, Math.min(90, (e.minutes / 60) * H))
                      return (
                        <button key={e.id} className="absolute overflow-hidden px-1.5 py-1 text-left" style={{ top, height: h, left: 1, right: 1, background: e.kind === 'fixed' ? 'var(--accent-wash)' : 'var(--surface-2)', borderLeft: `2px solid ${e.color}` }} onClick={() => {
                          if (e.kind === 'task') { const row = tasks.find((t) => t.id === e.id); if (row) setEditingTask(row) }
                          if (e.kind === 'fixed') { const row = commitments.find((c) => c.id === e.id); if (row) setEditingCommitment(row) }
                          if (e.kind === 'exam') { const row = assessments.find((a) => a.id === e.id); if (row) setEditingAssessment(row) }
                        }}>
                          <div className="truncate text-[10px] font-medium leading-tight">{e.title}</div>
                          <div className="data-sm dim truncate" style={{ fontSize: 9 }}>{e.sub}</div>
                        </button>
                      )
                    })}
                    {topNow != null && <div className="pointer-events-none absolute inset-x-0" style={{ top: topNow }}><div className="now-line" /></div>}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="dim mt-4 text-[12px]">Tap a block to edit. Tap + over a day to place a task.</p>
        </section>
      )}

      {tab === 'backlog' && (
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <section>
            <SectionLabel right={<button className="btn btn-quiet btn-sm" onClick={() => setEditingTask({ ...blankTask(), courseId: courses[0]?.id ?? null })} aria-label="Add task"><Icon name="plus" size={13} /></button>}>
              Tasks · {tasks.filter((t) => !t.done).length} open
            </SectionLabel>
            <div className="rule-list">
              {tasks.filter((t) => !t.done).map((t) => (
                <div key={t.id} className="rule-row">
                  <button onClick={() => void db.tasks.put(touch({ ...t, done: 1 }))} aria-label="Complete" className="dim"><Icon name="check" size={16} /></button>
                  <div className="row-primary">
                    <div className="row-title truncate">{t.title}</div>
                    <div className="row-sub">{nameOf(t.courseId)} · {t.estimateMin} min {t.dueAt ? `· ${new Date(t.dueAt).toLocaleDateString()}` : ''}{t.source?.startsWith('rescue') || t.source?.startsWith('rebuild') ? ' · generated' : ''}</div>
                  </div>
                  <button className="btn btn-icon btn-quiet" onClick={() => setEditingTask(t)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-icon btn-quiet" onClick={() => setDeleting({ table: 'tasks', id: t.id })} aria-label="Delete"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              {!tasks.filter((t) => !t.done).length && <p className="muted py-8 text-[13px]">Nothing in the backlog.</p>}
            </div>
          </section>

          <section>
            <SectionLabel>Chapters · {topics.length}</SectionLabel>
            <div className="rule-list">
              {topics.map((t) => (
                <div key={t.id} className="rule-row">
                  <span className="h-2 w-2" style={{ background: colorOf(t.courseId) }} />
                  <div className="row-primary">
                    <div className="row-title truncate">{t.title}</div>
                    <div className="row-sub">{nameOf(t.courseId)} · confidence {t.confidence}/5 · {t.estimateMin ?? 30}m estimated{t.done ? ' · done' : ''}</div>
                  </div>
                  <button className="btn btn-icon btn-quiet" onClick={() => setEditingTopic(t)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-icon btn-quiet" onClick={() => setDeleting({ table: 'topics', id: t.id })} aria-label="Delete"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              {!topics.length && <p className="muted py-8 text-[13px]">Add chapters to unlock readiness and recall.</p>}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn" disabled={!courses.length} onClick={() => setNewTopic(true)}><Icon name="plus" size={14} /> Add chapter</button>
              <button className="btn" onClick={() => setNewExam(true)}><Icon name="plus" size={14} /> Add exam</button>
            </div>
          </section>

          <section className="lg:col-span-2">
            <SectionLabel>Exams & assessments · {assessments.length}</SectionLabel>
            <div className="rule-list">
              {assessments.map((a) => (
                <div key={a.id} className="rule-row">
                  <span className="h-2 w-2" style={{ background: a.kind === 'exam' ? 'var(--accent)' : 'var(--text-3)' }} />
                  <div className="row-primary">
                    <div className="row-title truncate">{a.title}</div>
                    <div className="row-sub">{nameOf(a.courseId)} · {a.kind} · weight {a.weight}%{a.score != null ? ` · ${a.score}/${a.maxScore}` : ''}</div>
                  </div>
                  <span className="data-sm dim">{a.dueAt ? new Date(a.dueAt).toLocaleDateString() : 'No date'}</span>
                  <button className="btn btn-icon btn-quiet" onClick={() => setEditingAssessment(a)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-icon btn-quiet" onClick={() => setDeleting({ table: 'assessments', id: a.id })} aria-label="Delete"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              {!assessments.length && <p className="muted py-8 text-[13px]">Add an exam date to see readiness on the home screen.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'courses' && (
        <section className="mt-12">
          <SectionLabel right={<button className="btn btn-sm" onClick={() => setNewCourse(true)}><Icon name="plus" size={13} /> New course</button>}>
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((c) => {
              const own = topics.filter((t) => t.courseId === c.id)
              return (
                <div key={c.id} className="panel p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3" style={{ background: c.color }} />
                      <div>
                        <div className="display display-sm">{c.name}</div>
                        <div className="label mt-1">{c.code || 'No code'} · {own.length} chapters</div>
                      </div>
                    </div>
                    <button className="btn btn-icon btn-quiet" onClick={() => setEditingCourse(c)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  </div>
                  <div className="rule-list mt-6">
                    {own.slice(0, 5).map((t) => (
                      <div key={t.id} className="rule-row" style={{ padding: '9px 0' }}>
                        <span className="data-sm dim">{t.done ? '✓' : String(t.confidence)}</span>
                        <div className="row-primary"><div className="row-title truncate">{t.title}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {!courses.length && <p className="muted text-[13px]">No courses yet. Add one to begin.</p>}
          </div>
        </section>
      )}

      {tab === 'commitments' && (
        <section className="mt-12 max-w-[860px]">
          <SectionLabel right={<button className="btn btn-sm" onClick={() => setNewCommitment(true)}><Icon name="plus" size={13} /> Add fixed block</button>}>
            Fixed commitments
          </SectionLabel>
          <p className="muted mb-6 max-w-2xl text-[13px]">School, coaching, work and personal time. The planner treats these as barriers, so it never promises a session where you cannot study.</p>
          <div className="rule-list">
            {commitments.map((c) => (
              <div key={c.id} className="rule-row">
                <span className="chip">{c.kind}</span>
                <div className="row-primary">
                  <div className="row-title truncate">{c.title}</div>
                  <div className="row-sub">{c.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' · ')} · {fmtMinutes(c.startMin)}–{fmtMinutes(c.endMin)}</div>
                </div>
                <button className="btn btn-icon btn-quiet" onClick={() => setEditingCommitment(c)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                <button className="btn btn-icon btn-quiet" onClick={() => setDeleting({ table: 'commitments', id: c.id })} aria-label="Delete"><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {!commitments.length && <EmptyState icon="clock" title="No fixed time yet." hint="Add your class or coaching hours and the planner will stop scheduling through them." />}
          </div>
        </section>
      )}

      {/* Rebuild */}
      <Modal open={rebuild} onClose={() => setRebuild(false)} title="Rebuild the plan" wide>
        <p className="muted text-[13px]">Choose how much you can realistically study. Nothing is overwritten — generated blocks are marked, so a later rebuild can replace just those.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="field"><label>Days ahead</label><input className="input" type="number" min={1} max={60} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 1)} /></div>
          <div className="field"><label>Hours available per day</label><input className="input" type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 1)} /></div>
          <div className="field"><label>Intensity</label><select className="select" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))}>
            <option value={0.5}>Chill · half your time</option>
            <option value={0.8}>Balanced · most of your time</option>
            <option value={1}>Intensive · all of your time</option>
          </select></div>
          <div className="field"><label>Priority course</label><select className="select" value={preferred} onChange={(e) => setPreferred(e.target.value)}>
            <option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
          <div className="field sm:col-span-2"><label>Revision weight: {revisionWeight.toFixed(1)}</label><input type="range" min={0} max={1} step={0.1} value={revisionWeight} onChange={(e) => setRevisionWeight(Number(e.target.value))} /></div>
        </div>
        <button className="btn btn-primary mt-6" onClick={makePlan}>Preview the plan</button>
        {built && (
          <div className="mt-8 border-t pt-6">
            <div className="label mb-4">{built.summary}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {built.days.map((d) => (
                <div key={d.day} className="plan-day">
                  <span className="data-sm">day {d.day + 1}</span>
                  <span>{d.used} / {d.capacity} min</span>
                  {d.fixed > 0 && <span className="dim">{d.fixed} min fixed</span>}
                </div>
              ))}
            </div>
            <div className="rule-list mt-6">
              {built.blocks.slice(0, 40).map((b) => (
                <div key={b.id} className="rule-row" style={{ padding: '9px 0' }}>
                  <span className="data-sm dim">d{b.day + 1} {fmtMinutes(b.startMin)}</span>
                  <div className="row-primary"><div className="row-title truncate text-[13px]">{b.title}</div><div className="row-sub">{b.reason}</div></div>
                  <span className="data-sm">{b.minutes}m</span>
                </div>
              ))}
            </div>
            {built.unscheduled.length > 0 && (
              <p className="dim mt-5 text-[12px]">Left over: {built.unscheduled.map((u) => u.title).join(', ')}</p>
            )}
            <button className="btn btn-primary mt-7" onClick={() => void applySchedule(built, `rebuild-${Date.now()}`)}>Apply this plan</button>
          </div>
        )}
      </Modal>

      {/* Rescue */}
      <Modal open={rescue} onClose={() => setRescue(false)} title="Rescue my day" wide>
        {rescueResult && (
          <>
            <p className="muted text-[13px]">Completed sessions and fixed commitments stay. Everything else is rebuilt inside the time that is actually left.</p>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <div>
                <SectionLabel>Kept</SectionLabel>
                <div className="rule-list">
                  {rescueResult.kept.map((k, i) => (
                    <div key={i} className="rule-row" style={{ padding: '9px 0' }}>
                      <Icon name="check" size={14} className="positive" />
                      <div className="row-primary"><div className="row-title truncate text-[13px]">{k.title}</div><div className="row-sub">{k.reason}</div></div>
                    </div>
                  ))}
                  {!rescueResult.kept.length && <p className="muted py-4 text-[13px]">Nothing fixed or completed today.</p>}
                </div>
              </div>
              <div>
                <SectionLabel>Moved</SectionLabel>
                <div className="rule-list">
                  {rescueResult.moved.map((m, i) => (
                    <div key={i} className="rule-row" style={{ padding: '9px 0' }}>
                      <span className="data-sm" style={{ color: 'var(--accent)' }}>{m.from} → {m.to}</span>
                      <div className="row-primary"><div className="row-title truncate text-[13px]">{m.title}</div><div className="row-sub">{m.reason}</div></div>
                    </div>
                  ))}
                  {!rescueResult.moved.length && <p className="muted py-4 text-[13px]">No timed tasks needed moving.</p>}
                </div>
              </div>
            </div>
            <div className="mt-8">
              <SectionLabel>Recovered day · {rescueResult.preview.summary}</SectionLabel>
              <div className="rule-list">
                {rescueResult.preview.blocks.map((b) => (
                  <div key={b.id} className="rule-row" style={{ padding: '9px 0' }}>
                    <span className="data-sm dim">{fmtMinutes(b.startMin)}</span>
                    <div className="row-primary"><div className="row-title truncate text-[13px]">{b.title}</div><div className="row-sub">{b.reason}</div></div>
                    <span className="data-sm">{b.minutes}m</span>
                  </div>
                ))}
                {!rescueResult.preview.blocks.length && <p className="muted py-5 text-[13px]">There is no room left today. That is a real answer, not a failure.</p>}
              </div>
            </div>
            {rescueResult.deferred.length > 0 && (
              <p className="dim mt-5 text-[12px]">Deferred, untouched: {rescueResult.deferred.map((d) => d.title).join(', ')}</p>
            )}
            <div className="mt-8 flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!rescueResult.preview.blocks.length} onClick={() => void applySchedule(rescueResult.preview, `rescue-${Date.now()}`)}>Accept recovered day</button>
              <button className="btn btn-quiet" onClick={() => setRescue(false)}>Keep my original plan</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={scheduleDay != null} onClose={() => setScheduleDay(null)} title={`Place a task · ${scheduleDay != null ? week[scheduleDay]?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) : ''}`}>
        <QuickScheduleForm courses={courses} onSave={(title, time, minutes, courseId) => {
          if (scheduleDay != null) void quickSchedule(title, week[scheduleDay], time, minutes, courseId)
        }} />
      </Modal>

      <Modal open={editingTask != null} onClose={() => setEditingTask(null)} title="Task">
        {editingTask && <TaskForm task={editingTask} courses={courses} topics={topics} onSave={() => setEditingTask(null)} />}
      </Modal>
      <Modal open={editingCourse != null} onClose={() => setEditingCourse(null)} title="Course">
        {editingCourse && <CourseForm course={editingCourse} onSave={() => setEditingCourse(null)} />}
      </Modal>
      <Modal open={editingTopic != null} onClose={() => setEditingTopic(null)} title="Chapter">
        {editingTopic && <TopicForm topic={editingTopic} courses={courses} onSave={() => setEditingTopic(null)} />}
      </Modal>
      <Modal open={editingAssessment != null} onClose={() => setEditingAssessment(null)} title="Assessment">
        {editingAssessment && <AssessmentForm assessment={editingAssessment} courses={courses} onSave={() => setEditingAssessment(null)} />}
      </Modal>
      <Modal open={editingCommitment != null} onClose={() => setEditingCommitment(null)} title="Fixed commitment">
        {editingCommitment && <CommitmentForm commitment={editingCommitment} onSave={() => setEditingCommitment(null)} />}
      </Modal>
      <Modal open={newCourse} onClose={() => setNewCourse(false)} title="New course">
        <CourseForm onSave={() => setNewCourse(false)} />
      </Modal>
      <Modal open={newTopic} onClose={() => setNewTopic(false)} title="New chapter">
        <TopicForm courses={courses} onSave={() => setNewTopic(false)} />
      </Modal>
      <Modal open={newExam} onClose={() => setNewExam(false)} title="New exam">
        <AssessmentForm courses={courses} onSave={() => setNewExam(false)} />
      </Modal>
      <Modal open={newCommitment} onClose={() => setNewCommitment(false)} title="New fixed commitment">
        <CommitmentForm onSave={() => setNewCommitment(false)} />
      </Modal>

      <Confirm
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete this record?"
        description="It will disappear from your plan and stats. This cannot be undone."
        onConfirm={() => { if (deleting) void softDelete(deleting.table, deleting.id) }}
      />
    </div>
  )
}

function blankTask(): Task {
  return stamp({
    id: uid(), title: '', courseId: null, dueAt: null,
    priority: 2, estimateMin: 25, done: 0, note: '', source: 'manual',
  })
}

function QuickScheduleForm({ courses, onSave }: { courses: Course[]; onSave: (title: string, time: string, minutes: number, courseId: string) => void }) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('09:00')
  const [minutes, setMinutes] = useState(25)
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave(title.trim(), time, minutes, courseId) }}>
      <div className="field"><label>What will you do?</label><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review chapter 4" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label>Time</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="field"><label>Minutes</label><input className="input" type="number" min={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 25)} /></div>
      </div>
      <div className="field"><label>Course</label><select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">No course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <button className="btn btn-primary mt-2" type="submit">Place on the week</button>
    </form>
  )
}
