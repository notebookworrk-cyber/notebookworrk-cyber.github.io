import type { Session, Topic } from '../db/types'

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * Chapter duration estimate. Starts from the user's estimate, then bends it
 * toward what actually happened for that chapter. Never claims more precision
 * than the number of sessions behind it.
 */
export function estimateMinutes(input: {
  topic: Topic
  sessions: Session[]
}): number {
  const base = clamp(input.topic.estimateMin || 30, 5, 180)
  const own = input.sessions.filter(
    (s) => s.deletedAt == null && s.mode === 'focus' && s.topicId === input.topic.id,
  )
  if (!own.length) {
    // Low confidence usually means the first pass takes longer.
    return Math.round(clamp(base + (3 - input.topic.confidence) * 5, 15, 120) / 5) * 5
  }
  const actual = own.reduce((sum, s) => sum + s.minutes, 0)
  const planned = own.reduce((sum, s) => sum + Math.max(1, s.plannedMin || s.minutes), 0)
  const observed = actual / Math.max(1, planned)
  // One session barely moves the estimate; several carry real weight.
  const weight = clamp(own.length / 4, 0, 1)
  const factor = clamp(1 + (observed - 1) * weight, 0.6, 1.7)
  return Math.round(clamp(base * factor, 15, 120) / 5) * 5
}

export interface EstimateAccuracy {
  sessions: number
  averageRatio: number | null
  underestimated: number
  overestimated: number
  note: string
}

/** Study Flight Recorder: estimated versus actual time, from local sessions only. */
export function estimateAccuracy(sessions: Session[]): EstimateAccuracy {
  const own = sessions.filter(
    (s) => s.deletedAt == null && s.mode === 'focus' && s.plannedMin != null && s.plannedMin > 0,
  )
  if (!own.length) {
    return {
      sessions: 0,
      averageRatio: null,
      underestimated: 0,
      overestimated: 0,
      note: 'Finish a few planned sessions to see how close your estimates are.',
    }
  }
  const ratios = own.map((s) => s.minutes / s.plannedMin!)
  const average = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const underestimated = ratios.filter((r) => r > 1.15).length
  const overestimated = ratios.filter((r) => r < 0.85).length
  const note =
    average > 1.15
      ? 'You usually spend longer than planned. Your estimates can be a little more generous.'
      : average < 0.85
        ? 'You tend to finish early. Your estimates have room to tighten.'
        : 'Your estimates and actual time are close.'
  return { sessions: own.length, averageRatio: average, underestimated, overestimated, note }
}
