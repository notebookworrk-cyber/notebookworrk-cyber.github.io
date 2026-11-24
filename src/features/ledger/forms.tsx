import { useState } from 'react'
import { Field } from '../../app/ui'
import { db } from '../../db/db'
import { stamp, touch, uid, type Assessment, type AssessmentKind, type Course, type Task, type Topic } from '../../db/types'
import { fromLocalInput, toLocalInput, uniqueCourseColors } from '../../lib/dates'

const KINDS: AssessmentKind[] = ['exam', 'quiz', 'assignment', 'project', 'presentation']

function courseOptions(courses: Course[]) {
  return [
    <option key="none" value="">No course</option>,
    ...courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>),
  ]
}

export function TaskForm({ task, courses, onSave }: { task?: Task; courses: Course[]; onSave: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [courseId, setCourseId] = useState(task?.courseId ?? '')
  const [due, setDue] = useState(toLocalInput(task?.dueAt ?? null))
  const [priority, setPriority] = useState(task?.priority ?? 2)
  const [estimate, setEstimate] = useState(task?.estimateMin ?? 30)
  const [note, setNote] = useState(task?.note ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const record: Task = {
      id: task?.id ?? uid(),
      title: title.trim(),
      courseId: courseId || null,
      dueAt: fromLocalInput(due),
      priority,
      estimateMin: Math.max(5, Number(estimate) || 30),
      done: task?.done ?? 0,
      note,
      updatedAt: task?.updatedAt ?? Date.now(),
      deletedAt: null,
      rev: task?.rev ?? 1,
    }
    await db.tasks.put(task ? touch(record) : stamp(record))
    onSave()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Field label="What needs doing?">
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review chapter 4" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course"><select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courseOptions(courses)}</select></Field>
        <Field label="Due"><input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <select className="select" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            <option value={1}>High</option><option value={2}>Normal</option><option value={3}>Low</option>
          </select>
        </Field>
        <Field label="Estimate (min)"><input className="input" type="number" min={5} value={estimate} onChange={(e) => setEstimate(Number(e.target.value))} /></Field>
      </div>
      <Field label="Note"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional detail…" /></Field>
      <button className="btn btn-primary mt-1" type="submit">{task ? 'Save changes' : 'Add task'}</button>
    </form>
  )
}

export function CourseForm({ course, onSave }: { course?: Course; onSave: () => void }) {
  const [name, setName] = useState(course?.name ?? '')
  const [code, setCode] = useState(course?.code ?? '')
  const [credits, setCredits] = useState(course?.credits ?? 3)
  const [teacher, setTeacher] = useState(course?.teacher ?? '')
  const [semester, setSemester] = useState(course?.semester ?? '')
  const [color, setColor] = useState(course?.color ?? uniqueCourseColors()[0])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const record: Course = {
      id: course?.id ?? uid(),
      name: name.trim(), code: code.trim(), credits: Number(credits) || 3,
      teacher: teacher.trim(), semester: semester.trim(), color,
      createdAt: course?.createdAt ?? Date.now(),
      updatedAt: course?.updatedAt ?? Date.now(), deletedAt: null, rev: course?.rev ?? 1,
    }
    await db.courses.put(course ? touch(record) : stamp(record))
    onSave()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Field label="Course name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Organic Chemistry" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CHEM 201" /></Field>
        <Field label="Credits"><input className="input" type="number" min={0} value={credits} onChange={(e) => setCredits(Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teacher"><input className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)} /></Field>
        <Field label="Semester"><input className="input" value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Fall 2026" /></Field>
      </div>
      <Field label="Colour">
        <div className="flex flex-wrap gap-2 pt-1">
          {uniqueCourseColors().map((c) => (
            <button key={c} type="button" className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }} onClick={() => setColor(c)} aria-label={`Choose ${c}`} />
          ))}
        </div>
      </Field>
      <button className="btn btn-primary mt-1" type="submit">{course ? 'Save changes' : 'Create course'}</button>
    </form>
  )
}

export function AssessmentForm({ assessment, courses, defaultCourseId = '', onSave }: { assessment?: Assessment; courses: Course[]; defaultCourseId?: string; onSave: () => void }) {
  const [title, setTitle] = useState(assessment?.title ?? '')
  const [courseId, setCourseId] = useState(assessment?.courseId ?? defaultCourseId)
  const [kind, setKind] = useState<AssessmentKind>(assessment?.kind ?? 'exam')
  const [weight, setWeight] = useState(assessment?.weight ?? 20)
  const [due, setDue] = useState(toLocalInput(assessment?.dueAt ?? null))
  const [score, setScore] = useState(assessment?.score == null ? '' : String(assessment.score))
  const [maxScore, setMaxScore] = useState(assessment?.maxScore ?? 100)
  const [note, setNote] = useState(assessment?.note ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const record: Assessment = {
      id: assessment?.id ?? uid(),
      title: title.trim(), courseId: courseId || null, kind,
      weight: Math.max(0, Number(weight) || 0),
      dueAt: fromLocalInput(due),
      score: score === '' ? null : Number(score),
      maxScore: Math.max(1, Number(maxScore) || 100),
      note,
      updatedAt: assessment?.updatedAt ?? Date.now(), deletedAt: null, rev: assessment?.rev ?? 1,
    }
    await db.assessments.put(assessment ? touch(record) : stamp(record))
    onSave()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Field label="Assessment"><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Midterm exam" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course"><select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courseOptions(courses)}</select></Field>
        <Field label="Type"><select className="select" value={kind} onChange={(e) => setKind(e.target.value as AssessmentKind)}>{KINDS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (%)"><input className="input" type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></Field>
        <Field label="Due"><input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Score (blank = not graded)"><input className="input" type="number" value={score} onChange={(e) => setScore(e.target.value)} /></Field>
        <Field label="Out of"><input className="input" type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} /></Field>
      </div>
      <Field label="Note"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="btn btn-primary mt-1" type="submit">{assessment ? 'Save changes' : 'Add assessment'}</button>
    </form>
  )
}

export function TopicForm({ topic, courses, onSave }: { topic?: Topic; courses: Course[]; onSave: () => void }) {
  const [courseId, setCourseId] = useState(topic?.courseId ?? courses[0]?.id ?? '')
  const [title, setTitle] = useState(topic?.title ?? '')
  const [confidence, setConfidence] = useState(topic?.confidence ?? 3)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !courseId) return
    const record: Topic = {
      id: topic?.id ?? uid(), courseId, title: title.trim(), confidence,
      done: topic?.done ?? 0,
      updatedAt: topic?.updatedAt ?? Date.now(), deletedAt: null, rev: topic?.rev ?? 1,
    }
    await db.topics.put(topic ? touch(record) : stamp(record))
    onSave()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Field label="Chapter or topic"><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Thermodynamics" /></Field>
      <Field label="Course"><select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label={`Confidence: ${confidence} / 5`} hint="1 = lost, 5 = could teach it">
        <input className="input" type="range" min={1} max={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
      </Field>
      <button className="btn btn-primary mt-1" type="submit">{topic ? 'Save changes' : 'Add topic'}</button>
    </form>
  )
}
