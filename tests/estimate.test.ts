import { describe, expect, it } from 'vitest'
import { estimateAccuracy, estimateMinutes } from '../src/lib/estimate'
import { session, topic } from './fixtures'

describe('duration estimation', () => {
  it('stays conservative without history', () => {
    expect(estimateMinutes({ topic: topic({ confidence: 1, estimateMin: 30 }), sessions: [] })).toBe(40)
  })

  it('learns from actual minutes for that chapter', () => {
    const own = [session({ minutes: 50, plannedMin: 25 }), session({ id: 's2', minutes: 50, plannedMin: 25 })]
    expect(estimateMinutes({ topic: topic(), sessions: own })).toBeGreaterThan(30)
  })

  it('ignores other chapters and breaks', () => {
    const own = [
      session({ id: 'a', topicId: 'other', minutes: 90, plannedMin: 25 }),
      session({ id: 'b', mode: 'break', minutes: 90, plannedMin: 25 }),
    ]
    expect(estimateMinutes({ topic: topic(), sessions: own })).toBe(35)
  })

  it('reports estimate accuracy honestly', () => {
    const accuracy = estimateAccuracy([
      session({ minutes: 40, plannedMin: 25 }),
      session({ id: 's2', minutes: 10, plannedMin: 25 }),
    ])
    expect(accuracy.sessions).toBe(2)
    expect(accuracy.underestimated).toBe(1)
    expect(accuracy.overestimated).toBe(1)
  })
})
