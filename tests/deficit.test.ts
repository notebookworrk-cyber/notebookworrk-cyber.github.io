import { describe, expect, it } from 'vitest'
import { computeDeficit } from '../src/lib/deficit'
import { DAY } from '../src/lib/dates'
import { assessment, commitment, now, topic } from './fixtures'

describe('the front-door deficit', () => {
  it('prices remaining chapters against usable hours before the nearest exam', () => {
    const result = computeDeficit({
      topics: [topic({ id: 'a', estimateMin: 60 }), topic({ id: 'b', estimateMin: 90 })],
      assessments: [assessment({ kind: 'exam', dueAt: now + 7 * DAY })],
      commitments: [],
      hoursPerDay: 2,
      now,
    })
    expect(result?.requiredMin).toBe(150)
    expect(result?.examDays).toBe(7)
    // Up to 120 min/day, but today is capped by the clock and free windows.
    expect(result!.usableMin).toBeGreaterThan(0)
    expect(result!.gapMin).toBe(150 - result!.usableMin)
  })

  it('subtracts fixed commitments from the usable total', () => {
    const base = {
      topics: [topic()], assessments: [], hoursPerDay: 8, now,
    }
    const free = computeDeficit({ ...base, commitments: [] })!
    const busy = computeDeficit({
      ...base,
      commitments: [commitment({ startMin: 8 * 60, endMin: 17 * 60, days: [new Date(now).getDay()] })],
    })!
    expect(busy.usableMin).toBeLessThan(free.usableMin)
  })

  it('never reports a deficit when every chapter is done', () => {
    expect(computeDeficit({
      topics: [topic({ done: 1 })], assessments: [], commitments: [], hoursPerDay: 2, now,
    })).toBeNull()
  })

  it('marks thin evidence when there are only a couple of chapters', () => {
    const result = computeDeficit({
      topics: [topic()], assessments: [], commitments: [], hoursPerDay: 2, now,
    })
    expect(result?.evidence).toBe('thin')
  })
})
