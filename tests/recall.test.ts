import { describe, expect, it } from 'vitest'
import { buildReviewQueue, nextInterval, recallUpdate, REVIEW_STEPS, scheduleNext } from '../src/lib/recall'
import { assessment, course, now, recall, topic } from './fixtures'
import { DAY } from '../src/lib/dates'

describe('spaced interval ladder', () => {
  it('moves easy out, effort holds, hard steps back, lost resets', () => {
    expect(nextInterval(3, 1)).toBe(3)
    expect(nextInterval(2, 3)).toBe(3)
    expect(nextInterval(1, 7)).toBe(3)
    expect(nextInterval(0, 30)).toBe(1)
    expect(REVIEW_STEPS).toEqual([1, 3, 7, 14, 30])
  })

  it('schedules a future due date from the supplied timestamp', () => {
    const result = scheduleNext({ rating: 3, currentIntervalDays: 3, now })
    expect(result.intervalDays).toBe(7)
    expect(result.nextDueAt).toBe(now + 7 * DAY)
  })
})

describe('recallUpdate', () => {
  it('updates confidence, lapses, count and next review from real data', () => {
    const updated = recallUpdate(topic({ confidence: 3, lapses: 1 }), 0, now)
    expect(updated.confidence).toBe(2)
    expect(updated.lapses).toBe(2)
    expect(updated.recallCount).toBe(1)
    expect(updated.intervalDays).toBe(1)
    expect(updated.nextDueAt).toBe(now + DAY)
  })
})

describe('buildReviewQueue', () => {
  it('promotes overdue recalls and explains the reason', () => {
    const queue = buildReviewQueue({
      topics: [topic({ nextReviewAt: now - 3 * DAY })],
      recalls: [recall()],
      assessments: [assessment()],
      courses: [course()],
      now,
    })
    expect(queue[0].status).toBe('overdue')
    expect(queue[0].reason).toMatch(/past its review date/)
    expect(queue[0].priority).toBeGreaterThan(100)
  })

  it('never invents a recall record for an untouched chapter', () => {
    const queue = buildReviewQueue({ topics: [topic()], recalls: [], assessments: [], courses: [course()], now })
    expect(queue[0].lastRating).toBeNull()
    expect(queue[0].recallCount).toBe(0)
  })
})
