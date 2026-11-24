import type {
  Assessment,
  Commitment,
  Course,
  Recall,
  Session,
  Task,
  Topic,
} from '../db/types'
import { DAY } from './dates'
import { estimateMinutes } from './estimate'

const DAY_START = 7 * 60
const DAY_END = 23 * 60
const MEALS: [number, number][] = [
  [12 * 60, 13 * 60],
  [18 * 60, 19 * 60],
]
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export type BlockKind = 'study' | 'revision' | 'task'

export interface Candidate {
  key: string
  kind: BlockKind
  title: string
  topicId: string | null
  taskId: string | null
  courseId: string | null
  courseName: string
  color: string
  minutes: number
  remaining: number
  priority: number
  reason: string
}

export interface ScheduledBlock {
  id: string
  day: number
  startMin: number
  minutes: number
  title: string
  kind: BlockKind
  topicId: string | null
  taskId: string | null
  courseId: string | null
  courseName: string
  color: string
  reason: string
  priority: number
}

export interface ScheduleDay {
  day: number
  capacity: number
  used: number
  fixed: number
}

export interface SchedulePreview {
  blocks: ScheduledBlock[]
  days: ScheduleDay[]
  unscheduled: { title: string; reason: string }[]
  summary: string
  totalMinutes: number
}

export interface SchedulerInput {
  now?: number
  topics: Topic[]
  tasks: Task[]
  assessments: Assessment[]
  courses: Course[]
  commitments: Commitment[]
  sessions: Session[]
  recalls: Recall[]
  horizonDays: number
  minutesPerDay: number
  intensity: number
  preferredCourseIds?: string[]
  revisionWeight?: number
  todayOnly?: boolean
}

interface ExamInfo {
  days: number
  weight: number
  title: string
}

function examInfo(assessments: Assessment[], courseId: string, now: number): ExamInfo | null {
  const exams = assessments
    .filter((a) => a.deletedAt == null && a.courseId === courseId && a.dueAt != null && a.dueAt > now && a.kind === 'exam')
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
  if (!exams.length) return null
  const nearest = exams[0]
  return {
    days: Math.max(0, Math.ceil(((nearest.dueAt ?? now) - now) / DAY)),
    weight: exams.reduce((sum, a) => sum + Math.max(0, a.weight), 0),
    title: nearest.title,
  }
}

function lastRecall(topicId: string, recalls: Recall[]): Recall | null {
  let best: Recall | null = null
  for (const r of recalls) {
    if (r.deletedAt != null || r.topicId !== topicId) continue
    if (!best || r.at > best.at) best = r
  }
  return best
}

function driver(parts: [number, string][], limit = 3): string {
  return parts
    .filter((p) => p[0] > 0.08)
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map((p) => p[1])
    .join(' · ')
}

export function buildCandidates(input: SchedulerInput): Candidate[] {
  const now = input.now ?? Date.now()
  const courseMap = new Map(input.courses.map((c) => [c.id, c]))
  const preferred = input.preferredCourseIds?.length ? new Set(input.preferredCourseIds) : null
  const revisionWeight = input.revisionWeight ?? 0.5
  const candidates: Candidate[] = []

  for (const topic of input.topics) {
    if (topic.deletedAt != null || topic.done === 1) continue
    if (preferred && !preferred.has(topic.courseId)) continue
    const course = courseMap.get(topic.courseId)
    const exam = examInfo(input.assessments, topic.courseId, now)
    const recall = lastRecall(topic.id, input.recalls)
    const revisionDue = topic.nextReviewAt
      ? clamp(1 - (topic.nextReviewAt - now) / DAY / 14, 0, 1)
      : 0
    const gap = (6 - topic.confidence) / 5
    const urgency = exam ? clamp(1 - exam.days / 30, 0, 1) : 0
    const weight = exam ? clamp(exam.weight / 100, 0, 1) : 0
    const lapses = clamp((topic.lapses ?? 0) / 3, 0, 1)
    const isRevision = topic.done === 0 && (revisionDue > 0.35 || recall?.rating === 0)

    const parts: [number, string][] = [
      [gap, `confidence ${topic.confidence}/5`],
      [urgency, exam ? `${exam.title} in ${exam.days}d` : ''],
      [weight, exam ? `exam worth ${exam.weight}%` : ''],
      [revisionDue, 'review due'],
      [lapses, 'recent difficult recall'],
    ]
    const score =
      100 *
      (0.3 * gap +
        0.24 * urgency +
        0.14 * weight +
        (isRevision ? 0.42 * revisionWeight : 0.1 * revisionDue) +
        0.1 * lapses)
    candidates.push({
      key: `${isRevision ? 'rev' : 'study'}:${topic.id}`,
      kind: isRevision ? 'revision' : 'study',
      title: topic.title,
      topicId: topic.id,
      taskId: null,
      courseId: topic.courseId,
      courseName: course?.name ?? 'Unassigned',
      color: course?.color ?? '#9a5f3c',
      minutes: estimateMinutes({ topic, sessions: input.sessions }),
      remaining: estimateMinutes({ topic, sessions: input.sessions }),
      priority: score,
      reason: driver(parts) || 'next chapter with the largest confidence gap',
    })
  }

  for (const task of input.tasks) {
    if (task.deletedAt != null || task.done === 1) continue
    if (preferred && task.courseId && !preferred.has(task.courseId)) continue
    const course = task.courseId ? courseMap.get(task.courseId) : undefined
    const days = task.dueAt == null ? 30 : Math.ceil((task.dueAt - now) / DAY)
    const dueUrgency = clamp(1 - Math.max(0, days) / 14, 0, 1)
    const overdue = days < 0 ? clamp(Math.abs(days) / 7, 0, 1) : 0
    const userPriority = task.priority === 1 ? 1 : task.priority === 3 ? 0 : 0.5
    const exam = task.courseId ? examInfo(input.assessments, task.courseId, now) : null
    const urgency = exam ? clamp(1 - exam.days / 30, 0, 1) : 0
    const score =
      100 *
      (0.42 * dueUrgency + 0.2 * overdue + 0.18 * userPriority + 0.12 * urgency + 0.08)
    candidates.push({
      key: `task:${task.id}`,
      kind: 'task',
      title: task.title,
      topicId: task.topicId ?? null,
      taskId: task.id,
      courseId: task.courseId,
      courseName: course?.name ?? 'Unassigned',
      color: course?.color ?? '#9a5f3c',
      minutes: Math.max(15, task.estimateMin || 25),
      remaining: Math.max(15, task.estimateMin || 25),
      priority: score,
      reason: driver([
        [overdue, `${Math.abs(days)}d overdue`],
        [dueUrgency, 'due soon'],
        [userPriority, 'marked high priority'],
        [urgency, exam ? `${exam.title} in ${exam.days}d` : ''],
      ]) || 'open task',
    })
  }

  return candidates.sort((a, b) => b.priority - a.priority)
}

export function commitmentsFor(commitments: Commitment[], date: Date): Commitment[] {
  const day = date.getDay()
  return commitments.filter((c) => c.deletedAt == null && c.days.includes(day))
}

function intervalsFor(day: number, commitments: Commitment[], now: number): [number, number][] {
  // Derive the weekday from the supplied timestamp so tests are deterministic.
  const weekday = new Date(now + day * DAY).getDay()
  return commitments
    .filter((c) => c.deletedAt == null && c.days.includes(weekday))
    .map((c) => [Math.max(DAY_START, c.startMin), Math.min(DAY_END, c.endMin)] as [number, number])
    .filter(([a, b]) => b > a)
}

function freeWindows(blocked: [number, number][], start = DAY_START, end = DAY_END): [number, number][] {
  const sorted = [...blocked, ...MEALS]
    .map(([a, b]) => [clamp(a, start, end), clamp(b, start, end)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  const merged: [number, number][] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1])
    else merged.push([...interval] as [number, number])
  }
  const windows: [number, number][] = []
  let cursor = start
  for (const [a, b] of merged) {
    if (a - cursor >= 25) windows.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (end - cursor >= 25) windows.push([cursor, end])
  return windows
}

/** Minutes left in the current day after fixed commitments, meals and now. */
export function availableMinutesToday(input: {
  now?: number
  commitments: Commitment[]
}): number {
  const now = input.now ?? Date.now()
  const d = new Date(now)
  const start = Math.max(
    DAY_START,
    d.getHours() * 60 + d.getMinutes() + 15,
  )
  if (start >= DAY_END) return 0
  const blocked = commitmentsFor(input.commitments, d).map((c) => [
    Math.max(start, c.startMin),
    Math.min(DAY_END, c.endMin),
  ] as [number, number])
  return freeWindows(blocked, start, DAY_END).reduce((sum, [a, b]) => sum + (b - a), 0)
}

/** Explainable greedy planner. Fixed commitments and meals are hard barriers. */
export function buildSchedule(input: SchedulerInput): SchedulePreview {
  const now = input.now ?? Date.now()
  const horizonDays = Math.max(1, Math.min(60, input.todayOnly ? 1 : input.horizonDays))
  const candidates = buildCandidates(input)
  const blocks: ScheduledBlock[] = []
  const days: ScheduleDay[] = []
  const pending = candidates.map((c) => ({ ...c }))
  let lastCourse: string | null = null

  for (let day = 0; day < horizonDays; day++) {
    const blocked = intervalsFor(day, input.commitments, now)
    const fixed = blocked.reduce((sum, [a, b]) => sum + (b - a), 0)
    // Today cannot use hours that have already passed.
    const d = new Date(now + day * DAY)
    const dayStart = day === 0
      ? Math.max(DAY_START, d.getHours() * 60 + d.getMinutes() + 15)
      : DAY_START
    const windows = freeWindows(blocked, dayStart).map(([a, b]) => [a, b] as [number, number])
    const available = windows.reduce((sum, [a, b]) => sum + (b - a), 0)
    const capacity =
      day === 0
        ? Math.min(
            Math.round((input.minutesPerDay * input.intensity) / 5) * 5,
            availableMinutesToday({ now, commitments: input.commitments }),
          )
        : Math.min(Math.round((input.minutesPerDay * input.intensity) / 5) * 5, available)
    let remaining = Math.max(0, capacity)
    const usedToday = new Set<string>()

    while (remaining >= 25 && pending.some((c) => c.remaining >= 25)) {
      const ordered = [...pending]
        .filter((c) => c.remaining >= 25)
        .map((c) => ({
          c,
          adjusted:
            c.priority -
            (usedToday.has(c.courseId ?? '') ? 18 : 0) -
            (lastCourse && c.courseId === lastCourse ? 25 : 0),
        }))
        .sort((a, b) => b.adjusted - a.adjusted)
      const chosen = ordered[0].c
      const chunk = Math.min(50, remaining, chosen.remaining)
      const minutes = Math.floor(chunk / 25) * 25
      if (minutes < 25) break

      let placed = false
      for (let w = 0; w < windows.length; w++) {
        const [start, end] = windows[w]
        const space = end - start
        if (space < minutes) continue
        blocks.push({
          id: `${chosen.key}:${day}:${start}`,
          day,
          startMin: start,
          minutes,
          title: chosen.title,
          kind: chosen.kind,
          topicId: chosen.topicId,
          taskId: chosen.taskId,
          courseId: chosen.courseId,
          courseName: chosen.courseName,
          color: chosen.color,
          reason: chosen.reason,
          priority: chosen.priority,
        })
        // Ten minutes to breathe after a block, if the window allows it.
        windows[w] = [start + minutes + Math.min(10, Math.max(0, space - minutes)), end]
        chosen.remaining -= minutes
        remaining -= minutes
        usedToday.add(chosen.courseId ?? '')
        lastCourse = chosen.courseId
        placed = true
        break
      }
      if (!placed) break
    }
    days.push({ day, capacity, used: capacity - remaining, fixed })
  }

  const unscheduled = pending
    .filter((c) => c.remaining > 0)
    .map((c) => ({
      title: c.title,
      reason: c.remaining < 25 ? 'remaining slice is under 5 minutes' : 'no room inside available time',
    }))

  const total = blocks.reduce((sum, b) => sum + b.minutes, 0)
  return {
    blocks,
    days,
    unscheduled,
    totalMinutes: total,
    summary: unscheduled.length
      ? `${total} minutes placed · ${unscheduled.length} item${unscheduled.length === 1 ? '' : 's'} left over`
      : `${total} minutes placed · everything fits`,
  }
}

export interface RescueResult {
  kept: { title: string; reason: string }[]
  moved: { title: string; from: string; to: string; reason: string }[]
  deferred: { title: string; reason: string }[]
  preview: SchedulePreview
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * Signature feature. Rebuilds only what is still possible today: completed work
 * and fixed commitments are preserved, and every change carries a reason.
 */
export function rescueDay(input: SchedulerInput): RescueResult {
  const now = input.now ?? Date.now()
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  const kept: RescueResult['kept'] = []
  const moved: RescueResult['moved'] = []
  const todayCommitments = commitmentsFor(input.commitments, new Date(now))
  for (const c of todayCommitments) {
    kept.push({ title: c.title, reason: `fixed commitment · ${hhmm(c.startMin)}–${hhmm(c.endMin)}` })
  }
  for (const s of input.sessions) {
    if (s.deletedAt == null && s.startedAt >= startOfToday && s.mode === 'focus') {
      kept.push({ title: `Focus · ${s.minutes} min`, reason: 'already completed' })
    }
  }
  for (const t of input.tasks) {
    if (t.deletedAt == null && t.done === 1) kept.push({ title: t.title, reason: 'already completed' })
  }

  const preview = buildSchedule({ ...input, now, horizonDays: 1, todayOnly: true })
  const taskMap = new Map(input.tasks.map((t) => [t.id, t]))
  for (const block of preview.blocks) {
    if (!block.taskId) continue
    const task = taskMap.get(block.taskId)
    if (!task?.dueAt) continue
    const original = new Date(task.dueAt)
    const originalMin = original.getHours() * 60 + original.getMinutes()
    if (originalMin !== block.startMin) {
      moved.push({
        title: task.title,
        from: hhmm(originalMin),
        to: hhmm(block.startMin),
        reason: block.reason,
      })
    }
  }
  return {
    kept,
    moved,
    deferred: preview.unscheduled,
    preview,
  }
}
