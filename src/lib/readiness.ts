import type { Assessment, Course, Recall, Session, Topic } from '../db/types'
import { DAY } from './dates'

export interface Leverage {
  topicId: string
  title: string
  courseId: string
  gain: number
  minutes: number
}

export interface ReadinessEvidence {
  label: string
  value: string
  state: 'present' | 'missing'
}

export interface CourseReadiness {
  course: Course
  low: number
  high: number
  mid: number
  exam: Assessment | null
  examDays: number | null
  topics: number
  done: number
  leverage: Leverage[]
  studiedWeek: number
  evidence: ReadinessEvidence[]
  missing: string[]
  updatedAt: number | null
  confidenceLabel: 'thin' | 'growing' | 'solid'
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const mastery = (confidence: number) => clamp01((confidence - 1) / 4)

function topicScore(topics: Topic[]): number {
  if (!topics.length) return 0
  const covered = topics.filter((t) => t.done === 1).length / topics.length
  const confidence = topics.reduce((s, t) => s + mastery(t.confidence), 0) / topics.length
  return 0.6 * covered + 0.4 * confidence
}

function gradedScore(assessments: Assessment[]): number | null {
  const graded = assessments.filter((a) => a.score != null && a.maxScore > 0 && a.weight > 0)
  if (!graded.length) return null
  const totalWeight = graded.reduce((s, a) => s + a.weight, 0)
  if (!totalWeight) return null
  return graded.reduce((s, a) => s + clamp01((a.score ?? 0) / a.maxScore) * a.weight, 0) / totalWeight
}

export function computeReadiness(input: {
  courses: Course[]
  topics: Topic[]
  assessments: Assessment[]
  sessions: Session[]
  recalls?: Recall[]
  now?: number
}): CourseReadiness[] {
  const { courses, topics, assessments, sessions, recalls = [] } = input
  const now = input.now ?? Date.now()
  const weekAgo = now - 7 * DAY

  return courses
    .map((course): CourseReadiness | null => {
      const ownTopics = topics.filter((t) => t.courseId === course.id && t.deletedAt == null)
      const ownAssessments = assessments.filter((a) => a.courseId === course.id && a.deletedAt == null)
      if (!ownTopics.length && !ownAssessments.length) return null

      const exams = ownAssessments
        .filter((a) => a.kind === 'exam' && a.dueAt != null && a.dueAt > now)
        .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
      const exam = exams[0] ?? null
      const examDays = exam?.dueAt ? Math.max(1, Math.ceil((exam.dueAt - now) / DAY)) : null

      const ts = topicScore(ownTopics)
      const gs = gradedScore(ownAssessments)
      const score = gs == null ? ts : 0.7 * ts + 0.3 * gs

      const studiedWeek = sessions
        .filter((s) => s.deletedAt == null && s.mode !== 'break' && s.courseId === course.id && s.startedAt >= weekAgo)
        .reduce((s, x) => s + x.minutes, 0)
      const remaining = ownTopics.filter((t) => t.done === 0).length
      const pace = remaining === 0 ? 1 : clamp01(studiedWeek / (remaining * 35))

      const graded = gs != null
      const dataPoints = ownTopics.length + (graded ? 2 : 0) + (studiedWeek > 0 ? 1 : 0)
      const spread = (dataPoints < 3 ? 0.09 : dataPoints < 6 ? 0.065 : 0.05) + (ownTopics.length < 3 ? 0.015 : 0)
      const base = clamp01(0.85 * score + 0.15 * pace)
      const low = Math.round(clamp01(base - spread) * 100)
      const high = Math.round(clamp01(base + spread) * 100)

      const ownRecalls = recalls.filter(
        (r) => r.deletedAt == null && ownTopics.some((t) => t.id === r.topicId),
      )
      const evidence: ReadinessEvidence[] = [
        {
          label: 'chapters',
          value: ownTopics.length ? `${ownTopics.filter((t) => t.done === 1).length} of ${ownTopics.length} done` : 'none recorded',
          state: ownTopics.length ? 'present' : 'missing',
        },
        {
          label: 'graded work',
          value: graded ? `${ownAssessments.filter((a) => a.score != null).length} result(s)` : 'no scores entered',
          state: graded ? 'present' : 'missing',
        },
        {
          label: 'recent study',
          value: studiedWeek ? `${studiedWeek} min in 7 days` : 'no sessions in 7 days',
          state: studiedWeek ? 'present' : 'missing',
        },
        {
          label: 'recall attempts',
          value: ownRecalls.length ? `${ownRecalls.length} recorded` : 'none recorded',
          state: ownRecalls.length ? 'present' : 'missing',
        },
      ]
      const missing = evidence.filter((e) => e.state === 'missing').map((e) => e.label)
      const confidenceLabel = missing.length >= 3 ? 'thin' : missing.length >= 2 ? 'growing' : 'solid'
      const updatedAt = [...ownTopics.map((t) => t.updatedAt), ...ownAssessments.map((a) => a.updatedAt)]
        .sort((a, b) => b - a)[0] ?? null

      const leverage: Leverage[] = ownTopics
        .filter((t) => t.done === 0)
        .map((topic) => {
          const nextTopics = ownTopics.map((t) =>
            t.id === topic.id ? { ...t, done: 1, confidence: 5 } : t,
          )
          const gain = Math.max(0, Math.round((topicScore(nextTopics) - ts) * 0.85 * 100))
          const minutes = Math.max(15, (6 - topic.confidence) * 12 + 10)
          return { topicId: topic.id, title: topic.title, courseId: course.id, gain, minutes }
        })
        .filter((l) => l.gain > 0)
        .sort((a, b) => b.gain / b.minutes - a.gain / a.minutes)
        .slice(0, 3)

      return {
        course,
        low,
        high,
        mid: Math.round(base * 100),
        exam,
        examDays,
        topics: ownTopics.length,
        done: ownTopics.filter((t) => t.done === 1).length,
        leverage,
        studiedWeek,
        evidence,
        missing,
        updatedAt,
        confidenceLabel,
      }
    })
    .filter((r): r is CourseReadiness => r != null)
    .sort((a, b) => (a.examDays ?? 999) - (b.examDays ?? 999))
}

export function nextAction(input: {
  topics: Topic[]
  assessments: Assessment[]
  courses: Course[]
  readiness: CourseReadiness[]
}): { title: string; courseId: string | null; topicId: string | null; minutes: number; reason: string } | null {
  const best = input.readiness.flatMap((r) =>
    r.leverage.slice(0, 1).map((l) => ({ r, l })),
  ).sort((a, b) => {
    const urgencyA = 100 / (a.r.examDays ?? 30)
    const urgencyB = 100 / (b.r.examDays ?? 30)
    return b.l.gain / b.l.minutes + urgencyB / 10 - (a.l.gain / a.l.minutes + urgencyA / 10)
  })[0]

  if (!best) return null
  return {
    title: best.l.title,
    courseId: best.l.courseId,
    topicId: best.l.topicId,
    minutes: best.l.minutes,
    reason: `Moves ${best.r.course.name} readiness by about ${best.l.gain}%`,
  }
}
