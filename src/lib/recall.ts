import type { Assessment, Recall, RecallMethod, RecallRating, Topic } from '../db/types'
import type { Course } from '../db/types'
import { DAY } from './dates'

/** Fixed, honest ladder. It is a starting point, not a guarantee of retention. */
export const REVIEW_STEPS = [1, 3, 7, 14, 30] as const

export interface RatingDef {
  id: RecallRating
  label: string
  short: string
  note: string
  confidence: number
}

export const RATINGS: RatingDef[] = [
  { id: 0, label: 'Could not recall', short: 'Lost', note: 'Back to one day. That is useful information.', confidence: 1 },
  { id: 1, label: 'Needed substantial help', short: 'Hard', note: 'Shorten the interval and revisit it soon.', confidence: 2 },
  { id: 2, label: 'Needed some effort', short: 'Effort', note: 'Hold the current interval.', confidence: 4 },
  { id: 3, label: 'Remembered easily', short: 'Easy', note: 'Extend the interval.', confidence: 5 },
]

export const METHODS: { id: RecallMethod; label: string; hint: string }[] = [
  { id: 'explain', label: 'Explain from memory', hint: 'Say it aloud as if teaching someone.' },
  { id: 'written', label: 'Quick written recall', hint: 'Write the key points without looking.' },
  { id: 'questions', label: 'Short question set', hint: 'Ask yourself three questions and answer them.' },
  { id: 'confidence', label: 'Just rate confidence', hint: 'No written answer needed.' },
]

export function ratingDef(rating: RecallRating): RatingDef {
  return RATINGS.find((r) => r.id === rating) ?? RATINGS[2]
}

export function stepFor(intervalDays: number | undefined): number {
  if (!intervalDays || intervalDays <= 0) return 0
  let best = 0
  REVIEW_STEPS.forEach((step, i) => {
    if (Math.abs(step - intervalDays) < Math.abs(REVIEW_STEPS[best] - intervalDays)) best = i
  })
  return best
}

/** Returns the next interval in days. Ratings move along a transparent ladder. */
export function nextInterval(rating: RecallRating, currentIntervalDays: number | undefined): number {
  const step = stepFor(currentIntervalDays)
  if (rating === 0) return 1
  if (rating === 1) return REVIEW_STEPS[Math.max(0, step - 1)]
  if (rating === 2) return REVIEW_STEPS[step]
  return REVIEW_STEPS[Math.min(REVIEW_STEPS.length - 1, step + 1)]
}

export function scheduleNext(input: {
  rating: RecallRating
  currentIntervalDays?: number
  now?: number
}): { intervalDays: number; nextDueAt: number } {
  const now = input.now ?? Date.now()
  const intervalDays = nextInterval(input.rating, input.currentIntervalDays)
  return { intervalDays, nextDueAt: now + intervalDays * DAY }
}

/** Confidence moves gradually; one bad recall does not erase prior knowledge. */
export function updatedConfidence(previous: number, rating: RecallRating): number {
  const target = ratingDef(rating).confidence
  return Math.max(1, Math.min(5, Math.round(previous * 0.6 + target * 0.4)))
}

/** The full state transition for one recall attempt, used by Review and tests. */
export function recallUpdate(topic: Topic, rating: RecallRating, now?: number) {
  const at = now ?? Date.now()
  const schedule = scheduleNext({ rating, currentIntervalDays: topic.reviewInterval, now: at })
  return {
    confidence: updatedConfidence(topic.confidence, rating),
    nextDueAt: schedule.nextDueAt,
    intervalDays: schedule.intervalDays,
    recallCount: (topic.recallCount ?? 0) + 1,
    lapses: (topic.lapses ?? 0) + (rating <= 1 ? 1 : 0),
    lastRecallAt: at,
    lastStudiedAt: at,
  }
}

export type ReviewStatus = 'overdue' | 'due' | 'upcoming' | 'weak' | 'new'

export interface ReviewItem {
  topic: Topic
  course: Course | null
  status: ReviewStatus
  dueInDays: number | null
  lastRating: RecallRating | null
  recallCount: number
  reason: string
  priority: number
}

function urgencyBoost(topic: Topic, assessments: Assessment[], now: number): number {
  const due = assessments
    .filter((a) => a.courseId === topic.courseId && a.dueAt != null && a.dueAt > now)
    .map((a) => (a.dueAt! - now) / DAY)
  if (!due.length) return 0
  const nearest = Math.min(...due)
  return nearest <= 7 ? 25 : nearest <= 14 ? 14 : nearest <= 30 ? 6 : 0
}

/**
 * A revision queue built only from stored records: recall dates, confidence,
 * completion, lapses and real assessment dates. No invented performance data.
 */
export function buildReviewQueue(input: {
  topics: Topic[]
  recalls: Recall[]
  assessments: Assessment[]
  courses: Course[]
  now?: number
}): ReviewItem[] {
  const now = input.now ?? Date.now()
  const courseMap = new Map(input.courses.map((c) => [c.id, c]))
  const latest = new Map<string, Recall>()
  for (const r of input.recalls) {
    if (r.deletedAt != null) continue
    const prev = latest.get(r.topicId)
    if (!prev || r.at > prev.at) latest.set(r.topicId, r)
  }

  return input.topics
    .map((topic): ReviewItem | null => {
      const last = latest.get(topic.id) ?? null
      const scheduled = topic.nextReviewAt ?? last?.nextDueAt ?? null
      const lapses = topic.lapses ?? 0
      const count = topic.recallCount ?? 0
      const confidence = topic.confidence

      let status: ReviewStatus
      let dueInDays: number | null = null
      let base: number
      let reason: string

      if (scheduled) {
        dueInDays = Math.ceil((scheduled - now) / DAY)
        if (dueInDays < 0) {
          status = 'overdue'
          base = 100 + Math.min(60, Math.abs(dueInDays) * 6)
          reason = `${Math.abs(dueInDays)} day${Math.abs(dueInDays) === 1 ? '' : 's'} past its review date`
        } else if (dueInDays <= 0) {
          status = 'due'
          base = 90
          reason = 'Review is due today'
        } else if (dueInDays <= 14) {
          status = 'upcoming'
          base = 45 - dueInDays
          reason = `Review in ${dueInDays} day${dueInDays === 1 ? '' : 's'}`
        } else {
          status = 'upcoming'
          base = 10
          reason = `Review in ${dueInDays} days`
        }
      } else if (confidence <= 2) {
        status = 'weak'
        base = 55 + (3 - confidence) * 8
        reason = `Confidence ${confidence}/5 with no recall recorded`
      } else {
        status = 'new'
        base = 22
        reason = 'No recall recorded yet'
      }

      const boost = urgencyBoost(topic, input.assessments, now)
      const priority =
        base + boost + (6 - confidence) * 5 + Math.min(24, lapses * 8) + (count === 0 && topic.done ? 6 : 0)

      if (boost >= 25 && status !== 'overdue') {
        reason += ' · exam within a week'
      } else if (lapses > 0) {
        reason += ` · ${lapses} difficult recall${lapses === 1 ? '' : 's'}`
      }

      return {
        topic,
        course: courseMap.get(topic.courseId) ?? null,
        status,
        dueInDays,
        lastRating: last?.rating ?? null,
        recallCount: count,
        reason,
        priority,
      }
    })
    .filter((item): item is ReviewItem => item != null)
    .sort((a, b) => b.priority - a.priority)
}
