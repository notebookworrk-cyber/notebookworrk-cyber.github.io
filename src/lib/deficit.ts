import type { Assessment, Commitment, Topic } from '../db/types'
import { DAY } from './dates'
import { availableMinutesToday } from './scheduler'

export interface Deficit {
  /** Nearest future exam, if one exists. */
  exam: Assessment | null
  examDays: number | null
  /** Minutes of chapter work still left, from your own estimates. */
  requiredMin: number
  /** Minutes genuinely available before that exam at your set pace. */
  usableMin: number
  /** Positive when the syllabus does not fit; negative when you have slack. */
  gapMin: number
  chaptersLeft: number
  hoursPerDay: number
  evidence: 'thin' | 'growing' | 'solid'
}

/**
 * The one number the front door is built around: usable hours before the next
 * exam minus the hours your remaining chapters require. Every input is either
 * entered by the user or derived from an existing engine — nothing is invented.
 */
export function computeDeficit(input: {
  topics: Topic[]
  assessments: Assessment[]
  commitments: Commitment[]
  hoursPerDay: number
  now?: number
}): Deficit | null {
  const { topics, assessments, commitments } = input
  const now = input.now ?? Date.now()
  const exam = assessments
    .filter((a) => a.deletedAt == null && a.kind === 'exam' && a.dueAt != null && a.dueAt > now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0] ?? null
  const examDays = exam?.dueAt ? Math.max(1, Math.ceil((exam.dueAt - now) / DAY)) : null
  const horizon = examDays ?? 14

  const remaining = topics.filter((t) => t.deletedAt == null && t.done === 0)
  if (!remaining.length) return null

  const requiredMin = remaining.reduce((sum, t) => sum + Math.max(10, Math.min(240, t.estimateMin ?? 35)), 0)
  const hoursPerDay = Math.max(0.5, Math.min(12, Number(input.hoursPerDay) || 2.5))
  const perDay = hoursPerDay * 60
  const today = Math.min(perDay, availableMinutesToday({ now, commitments }))
  const usableMin = Math.round(today + Math.max(0, horizon - 1) * perDay)

  const evidence: Deficit['evidence'] = remaining.length >= 6 && exam != null
    ? 'solid'
    : remaining.length >= 3
      ? 'growing'
      : 'thin'

  return {
    exam,
    examDays,
    requiredMin,
    usableMin,
    gapMin: requiredMin - usableMin,
    chaptersLeft: remaining.length,
    hoursPerDay,
    evidence,
  }
}
