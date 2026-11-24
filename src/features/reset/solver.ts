import type { Assessment, Course, Topic } from '../../db/types'
import { DAY } from '../../lib/dates'

export type PlanId = 'chill' | 'medium' | 'locked'

export interface PlanBlock {
  topicId: string
  title: string
  courseId: string
  courseName: string
  color: string
  minutes: number
  day: number
  confidence: number
}

export interface BuiltPlan {
  id: PlanId
  name: string
  note: string
  intensity: number
  blocks: PlanBlock[]
  totalMinutes: number
  coverage: number
  topicsCovered: number
}

const VARIANTS: { id: PlanId; name: string; note: string; intensity: number }[] = [
  { id: 'chill', name: 'Chill', note: 'The lightest route through what matters most.', intensity: 0.5 },
  { id: 'medium', name: 'Medium', note: 'Real coverage with a sustainable daily rhythm.', intensity: 0.8 },
  { id: 'locked', name: 'Locked In', note: 'Uses the full study time you said you have.', intensity: 1 },
]

interface ScoredTopic {
  topic: Topic
  score: number
  need: number
  originalNeed: number
}

export function buildPlans(input: {
  topics: Topic[]
  assessments: Assessment[]
  courses: Course[]
  horizonDays: number
  hoursPerDay: number
}): BuiltPlan[] {
  const { topics, assessments, courses, horizonDays, hoursPerDay } = input
  const now = Date.now()
  const horizon = Math.max(1, horizonDays) * DAY
  const upcoming = assessments.filter(
    (a) => a.deletedAt == null && a.dueAt != null && a.dueAt > now && a.dueAt <= now + horizon,
  )

  const courseWeight = new Map<string, number>()
  const nearest = new Map<string, number>()
  for (const a of upcoming) {
    const key = a.courseId ?? '__none__'
    courseWeight.set(key, (courseWeight.get(key) ?? 0) + a.weight)
    const days = Math.max(0, Math.ceil(((a.dueAt ?? now) - now) / DAY))
    nearest.set(key, Math.min(nearest.get(key) ?? Infinity, days))
  }

  const maxWeight = Math.max(1, ...courseWeight.values())
  const urgencyOf = (key: string) => 1 / (1 + (nearest.get(key) ?? Math.ceil(horizon / DAY)))
  const maxUrgency = Math.max(0.01, ...topics.map((t) => urgencyOf(t.courseId)))
  const courseMap = new Map(courses.map((c) => [c.id, c]))

  return VARIANTS.map((variant) => {
    const scored: ScoredTopic[] = topics
      .filter((t) => t.done === 0)
      .map((topic) => {
        const key = topic.courseId
        const gap = (6 - topic.confidence) / 5
        const urg = urgencyOf(key) / maxUrgency
        const weight = (courseWeight.get(key) ?? 0) / maxWeight
        const score = 100 * (0.45 * gap + 0.35 * urg + 0.2 * weight)
        const need = (6 - topic.confidence) * 20
        return { topic, score, need, originalNeed: need }
      })
      .sort((a, b) => b.score - a.score)

    const totalNeed = scored.reduce((s, t) => s + t.originalNeed, 0)
    if (!totalNeed) {
      return { ...variant, blocks: [], totalMinutes: 0, coverage: 100, topicsCovered: 0 }
    }

    const capacity = Math.round(Math.max(0.5, hoursPerDay) * 60 * variant.intensity / 25) * 25
    const blocks: PlanBlock[] = []
    let previousCourses = new Set<string>()

    for (let day = 0; day < Math.max(1, horizonDays); day++) {
      let remaining = capacity
      const usedToday = new Set<string>()
      let guard = 0
      while (remaining >= 25 && guard++ < 500) {
        const candidates = scored
          .filter((t) => t.need > 0)
          .map((t) => ({
            item: t,
            adjusted: t.score - (usedToday.has(t.topic.courseId) ? 40 : 0) - (previousCourses.has(t.topic.courseId) ? 8 : 0),
          }))
          .sort((a, b) => b.adjusted - a.adjusted)
        if (!candidates.length) break
        let chosen = candidates[0]
        if (usedToday.has(chosen.item.topic.courseId)) {
          const other = candidates.find((c) => !usedToday.has(c.item.topic.courseId))
          if (other) chosen = other
        }
        const minutes = Math.min(50, remaining, chosen.item.need)
        if (minutes < 25) break
        const course = courseMap.get(chosen.item.topic.courseId)
        blocks.push({
          topicId: chosen.item.topic.id,
          title: chosen.item.topic.title,
          courseId: chosen.item.topic.courseId,
          courseName: course?.name ?? 'Unassigned',
          color: course?.color ?? '#c8a951',
          minutes,
          day,
          confidence: chosen.item.topic.confidence,
        })
        chosen.item.need -= minutes
        remaining -= minutes
        usedToday.add(chosen.item.topic.courseId)
      }
      previousCourses = usedToday
    }

    const assigned = blocks.reduce((s, b) => s + b.minutes, 0)
    return {
      ...variant,
      blocks,
      totalMinutes: assigned,
      coverage: Math.min(100, (assigned / totalNeed) * 100),
      topicsCovered: new Set(blocks.map((b) => b.topicId)).size,
    }
  })
}
