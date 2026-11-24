import { useMemo, useState } from 'react'
import { Icon } from '../../app/icons'
import { Confirm, Modal, NowLine, SectionLabel, Segmented } from '../../app/ui'
import { InstrumentPage } from '../instrument/InstrumentPage'
import { useAssessments, useCourses, useSessions, useTasks, useTopics, useSetting } from '../../db/hooks'
import { db, softDelete } from '../../db/db'
import { stamp, touch, uid, type Assessment, type Course, type Task, type Topic } from '../../db/types'
import { addDays, dayKey, fmtTime, fromLocalInput, startOfWeek, toLocalInput } from '../../lib/dates'
import { buildPlans, type BuiltPlan } from '../reset/solver'
import { AssessmentForm, CourseForm, TaskForm, TopicForm } from '../ledger/forms'

type Tab = 'week' | 'backlog' | 'courses'
const HOUR_START = 7
const HOUR_END = 23
const HOUR_H = 30

export function Plan() {
  const courses = useCourses()
  const tasks = useTasks()
  const assessments = useAssessments()
  const topics = useTopics()
  const sessions = useSessions()
  const defaultHorizon = Number(useSetting('resetHorizon', '14')) || 14
  const defaultHours = Number(useSetting('resetHours', '2')) || 2

  const [tab, setTab] = useState<Tab>('week')
  const [anchor, setAnchor] = useState(0)
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7)
  const [scheduleDay, setScheduleDay] = useState<number | null>(null)
  const [rebuild, setRebuild] = useState(false)
  const [horizon, setHorizon] = useState(defaultHorizon)
  const [hours, setHours] = useState(defaultHours)
  const [built, setBuilt] = useState<BuiltPlan[] | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null)
  const [deleting, setDeleting] = useState<{ table: 'tasks' | 'courses' | 'topics' | 'assessments'; id: string } | null>(null)
  const [newCourse, setNewCourse] = useState(false)
  const [newTopic, setNewTopic] = useState(false)
  const [newExam, setNewExam] = useState(false)

  const week = useMemo(() => {
    const start = addDays(startOfWeek(), anchor * 7)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchor])

  const weekStart = week[0].getTime()
  const weekEnd = week[6].getTime() + 86_400_000
  const weekTasks = tasks.filter((t) => t.dueAt != null && t.dueAt >= weekStart && t.dueAt < weekEnd)
  const weekSessions = sessions.filter((s) => s.startedAt >= weekStart && s.startedAt < weekEnd && s.deletedAt == null)
  const weekExams = assessments.filter((a) => a.dueAt != null && a.dueAt >= weekStart && a.dueAt < weekEnd)

  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? 'Unassigned'
  const courseColor = (id: string | null) => courses.find((c) => c.id === id)?.color ?? 'var(--text-3)'

  function eventsFor(date: Date) {
    const key = dayKey(date)
    return [
      ...weekSessions.filter((s) => dayKey(s.startedAt) === key).map((s) => ({
        id: s.id,
        at: s.startedAt,
        minutes: s.minutes,
        title: courseName(s.courseId),
        sub: `${s.minutes} min`,
        color: courseColor(s.courseId),
        kind: 'session' as const,
      })),
      ...weekTasks.filter((t) => dayKey(t.dueAt!) === key).map((t) => ({
        id: t.id, at: t.dueAt!, minutes: t.estimateMin,
        title: t.title, sub: t.done ? 'Done' : `${t.estimateMin} min`,
        color: courseColor(t.courseId), kind: 'task' as const, done: t.done,
      })),
      ...weekExams.filter((a) => dayKey(a.dueAt!) === key).map((a) => ({
        id: a.id, at: a.dueAt!, minutes: 60,
        title: a.title, sub: a.kind, color: 'var(--accent)', kind: 'exam' as const,
      })),
    ]
  }

  function makePlans() {
    setBuilt(buildPlans({ topics, assessments, courses, horizonDays: horizon, hoursPerDay: hours }))
  }

  async function applyPlan(plan: BuiltPlan) {
    const perDay = new Map<number, number>()
    const rows: Task[] = plan.blocks.map((b) => {
      const startMin = 9 * 60 + (perDay.get(b.day) ?? 0)
      perDay.set(b.day, (perDay.get(b.day) ?? 0) + b.minutes)
      const due = addDays(new Date(), b.day)
      due.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
      return stamp({
        id: uid(), title: `Study ${b.title}`, courseId: b.courseId,
        dueAt: due.getTime(), priority: 2, estimateMin: b.minutes, done: 0, note: 'From Rebuild',
      })
    })
    await db.tasks.bulkAdd(rows)
    setRebuild(false)
    setBuilt(null)
    setAnchor(0)
    setTab('week')
  }

  async function quickSchedule(title: string, day: Date, time: string, minutes: number, courseId: string) {
    await db.tasks.add(stamp({
      id: uid(), title, courseId: courseId || null,
      dueAt: fromLocalInput(`${dayKey(day)}T${time}`),
      priority: 2, estimateMin: minutes, done: 0, note: '',
    }))
    setScheduleDay(null)
  }

  return (
    <InstrumentPage
      title="plan"
      note="time, made visible"
      actions={
        <>
          <Segmented
            value={tab}
            options={[{ value: 'week', label: 'Week' }, { value: 'backlog', label: 'Backlog' }, { value: 'courses', label: 'Courses' }]}
            onChange={setTab}
          />
          <button className="btn" onClick={() => setRebuild(true)}><Icon name="sync" size={15} /> Rebuild my week</button>
        </>
      }
    >

      {tab === 'week' && (
        <section>
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

          <div className="grid grid-cols-1 gap-px overflow-hidden md:grid-cols-7" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
            {week.map((day, dayIdx) => {
              const isToday = dayKey(day) === dayKey()
              const events = eventsFor(day)
              const topNow = isToday
                ? Math.max(0, Math.min((HOUR_END - HOUR_START) * HOUR_H, (new Date().getHours() + new Date().getMinutes() / 60 - HOUR_START) * HOUR_H))
                : null
              return (
                <div key={dayKey(day)} className={dayIdx === selectedDay ? '' : 'hidden md:block'} style={{ background: 'var(--bg)' }}>
                  <div className="flex items-center justify-between px-2 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                    <div>
                      <div className="data-sm dim">{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                      <div className="display display-sm mt-1">{day.getDate()}</div>
                    </div>
                    <button className="btn btn-quiet btn-icon" style={{ minWidth: 28, padding: 4 }} onClick={() => setScheduleDay(anchor * 7 + week.indexOf(day))} aria-label={`Add to ${dayKey(day)}`}>
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                  <div className="relative" style={{ height: (HOUR_END - HOUR_START) * HOUR_H }}>
                    {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                      <div key={i} className="absolute inset-x-0 h-px" style={{ top: i * HOUR_H, background: 'var(--line-soft)' }} />
                    ))}
                    {events.map((e) => {
                      const d = new Date(e.at)
                      const top = Math.max(0, (d.getHours() + d.getMinutes() / 60 - HOUR_START) * HOUR_H)
                      const h = Math.max(18, Math.min(90, (e.minutes / 60) * HOUR_H))
                      const onClick = () => {
                        if (e.kind === 'task') {
                          const row = tasks.find((t) => t.id === e.id)
                          if (row) setEditingTask(row)
                        } else if (e.kind === 'exam') {
                          const row = assessments.find((a) => a.id === e.id)
                          if (row) setEditingAssessment(row)
                        }
                      }
                      return (
                        <button key={e.id} onClick={onClick} className="absolute overflow-hidden px-1.5 py-1 text-left" style={{ top, height: h, left: 1, right: 1, background: e.kind === 'exam' ? 'var(--accent-wash)' : 'var(--surface-2)', borderLeft: `2px solid ${e.color}` }}>
                          <div className="truncate text-[10px] font-medium leading-tight">{e.title}</div>
                          <div className="data-sm dim truncate" style={{ fontSize: 9 }}>{fmtTime(e.at)}</div>
                        </button>
                      )
                    })}
                    {topNow != null && (
                      <div className="pointer-events-none absolute inset-x-0" style={{ top: topNow }}>
                        <NowLine />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="dim mt-4 text-[12px]">Tap a block to edit. Tap + over a day to place a new task.</p>
        </section>
      )}

      {tab === 'backlog' && (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <SectionLabel right={<button className="btn btn-quiet btn-sm" onClick={() => setEditingTask(blankTask())} aria-label="Add task"><Icon name="plus" size={13} /></button>}>
              Tasks · {tasks.filter((t) => !t.done).length} open
            </SectionLabel>
            <div className="rule-list">
              {tasks.filter((t) => !t.done).map((t) => (
                <div key={t.id} className="rule-row">
                  <button onClick={() => void db.tasks.put(touch({ ...t, done: 1 }))} aria-label="Complete" className="dim"><Icon name="check" size={16} /></button>
                  <div className="row-primary">
                    <div className="row-title truncate">{t.title}</div>
                    <div className="row-sub">{courseName(t.courseId)} · {t.estimateMin} min {t.dueAt ? `· ${new Date(t.dueAt).toLocaleDateString()}` : ''}</div>
                  </div>
                  <button className="btn btn-icon btn-quiet" onClick={() => setEditingTask(t)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-icon btn-quiet" onClick={() => setDeleting({ table: 'tasks', id: t.id })} aria-label="Delete"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              {!tasks.filter((t) => !t.done).length && <p className="muted py-8 text-[13px]">Nothing in the backlog.</p>}
            </div>
            <button className="btn mt-5" onClick={() => setEditingTask({ ...blankTask(), courseId: courses[0]?.id ?? null })}><Icon name="plus" size={14} /> Add task</button>
          </section>

          <section>
            <SectionLabel>Chapters · {topics.length}</SectionLabel>
            <div className="rule-list">
              {topics.map((t) => (
                <div key={t.id} className="rule-row">
                  <span className="h-2 w-2" style={{ background: courseColor(t.courseId) }} />
                  <div className="row-primary">
                    <div className="row-title truncate">{t.title}</div>
                    <div className="row-sub">{courseName(t.courseId)} · confidence {t.confidence}/5 {t.done ? '· done' : ''}</div>
                  </div>
                  <button className="btn btn-icon btn-quiet" onClick={() => setEditingTopic(t)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-icon btn-quiet" onClick={() => setDeleting({ table: 'topics', id: t.id })} aria-label="Delete"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              {!topics.length && <p className="muted py-8 text-[13px]">Add chapters to unlock readiness and leverage.</p>}
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
                    <div className="row-sub">{courseName(a.courseId)} · {a.kind} · weight {a.weight}%{a.score != null ? ` · ${a.score}/${a.maxScore}` : ''}</div>
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
        <section>
          <SectionLabel right={<button className="btn btn-sm" onClick={() => setNewCourse(true)}><Icon name="plus" size={13} /> New course</button>}>
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((c) => {
              const ownTopics = topics.filter((t) => t.courseId === c.id)
              return (
                <div key={c.id} className="panel p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3" style={{ background: c.color }} />
                      <div>
                        <div className="display display-sm">{c.name}</div>
                        <div className="label mt-1">{c.code || 'No code'} · {ownTopics.length} chapters</div>
                      </div>
                    </div>
                    <button className="btn btn-icon btn-quiet" onClick={() => setEditingCourse(c)} aria-label="Edit"><Icon name="edit" size={14} /></button>
                  </div>
                  <div className="mt-6 rule-list">
                    {ownTopics.slice(0, 5).map((t) => (
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

      {/* Rebuild */}
      <Modal open={rebuild} onClose={() => setRebuild(false)} title="Rebuild my week" wide>
        <p className="muted text-[13px]">Turns your chapters and exam dates into a concrete study schedule. Nothing is overwritten.</p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="field"><label>Days ahead</label><input className="input" type="number" min={1} max={60} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 1)} /></div>
          <div className="field"><label>Hours per day</label><input className="input" type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 1)} /></div>
        </div>
        <button className="btn mt-5" onClick={makePlans}>Build options</button>
        {built && (
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {built.map((p, i) => (
              <button key={p.id} onClick={() => void applyPlan(p)} className="panel p-5 text-left transition-colors hover:border-[var(--accent)]">
                <div className="display display-md">{String(i + 1).padStart(2, '0')}</div>
                <div className="mt-3 text-[14px] font-medium">{p.name}</div>
                <div className="muted mt-2 text-[12px]">{p.note}</div>
                <div className="data-sm mt-5 flex flex-col gap-1" style={{ color: 'var(--text-2)' }}>
                  <span>{Math.round(p.coverage)}% coverage</span>
                  <span>{p.topicsCovered} chapters</span>
                  <span>{Math.round(p.totalMinutes / 60)}h total</span>
                </div>
                <div className="mt-5 text-[12px]" style={{ color: 'var(--accent)' }}>Use this plan →</div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Quick schedule */}
      <Modal open={scheduleDay != null} onClose={() => setScheduleDay(null)} title={`Place a task · ${scheduleDay != null ? week[scheduleDay]?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) : ''}`}>
        <QuickScheduleForm
          courses={courses}
          onSave={(title, time, minutes, courseId) => {
            if (scheduleDay != null) void quickSchedule(title, week[scheduleDay], time, minutes, courseId)
          }}
        />
      </Modal>

      <Modal open={editingTask != null} onClose={() => setEditingTask(null)} title="Task">
        {editingTask && <TaskForm task={editingTask} courses={courses} onSave={() => setEditingTask(null)} />}
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
      <Modal open={newCourse} onClose={() => setNewCourse(false)} title="New course">
        <CourseForm onSave={() => setNewCourse(false)} />
      </Modal>
      <Modal open={newTopic} onClose={() => setNewTopic(false)} title="New chapter">
        <TopicForm courses={courses} onSave={() => setNewTopic(false)} />
      </Modal>
      <Modal open={newExam} onClose={() => setNewExam(false)} title="New exam">
        <AssessmentForm courses={courses} onSave={() => setNewExam(false)} />
      </Modal>

      <Confirm
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete this record?"
        description="It will disappear from your plan and stats. This cannot be undone."
        onConfirm={() => { if (deleting) void softDelete(deleting.table, deleting.id) }}
      />
    </InstrumentPage>
  )
}

function blankTask(): Task {
  return stamp({
    id: uid(), title: '', courseId: null, dueAt: null,
    priority: 2, estimateMin: 25, done: 0, note: '',
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
