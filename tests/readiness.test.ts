import { describe, expect, it } from 'vitest'
import { computeReadiness, nextAction } from '../src/lib/readiness'
import { DAY } from '../src/lib/dates'
import { assessment, course, now, recall, session, topic } from './fixtures'

describe('readiness', () => {
  it('shows which evidence is missing and widens thin estimates', () => {
    const thin = computeReadiness({
      courses: [course()], topics: [topic()], assessments: [], sessions: [], recalls: [], now,
    })[0]
    const solid = computeReadiness({
      courses: [course()],
      topics: [topic({ confidence: 4 })],
      assessments: [assessment({ score: 80 })],
      sessions: [session({ minutes: 120, startedAt: now - DAY })],
      recalls: [recall()],
      now,
    })[0]
    expect(thin.confidenceLabel).toBe('thin')
    expect(thin.missing).toContain('graded work')
    expect(solid.missing.length).toBeLessThan(thin.missing.length)
    expect(solid.high - solid.low).toBeLessThanOrEqual(thin.high - thin.low)
  })

  it('returns a chapter id so one-tap launch can link the session', () => {
    const readiness = computeReadiness({
      courses: [course()], topics: [topic({ confidence: 1 })],
      assessments: [assessment()], sessions: [], recalls: [], now,
    })
    const action = nextAction({ topics: [topic({ confidence: 1 })], assessments: [assessment()], courses: [course()], readiness })
    expect(action?.topicId).toBe('t1')
    expect(action?.reason).toMatch(/readiness/)
  })

  it('does not count break sessions as study pace', () => {
    const withFocus = computeReadiness({
      courses: [course()], topics: [topic()], assessments: [],
      sessions: [session({ minutes: 60, startedAt: now - DAY })], recalls: [], now,
    })[0]
    const withBreak = computeReadiness({
      courses: [course()], topics: [topic()], assessments: [],
      sessions: [session({ minutes: 60, mode: 'break', startedAt: now - DAY })], recalls: [], now,
    })[0]
    expect(withFocus.studiedWeek).toBe(60)
    expect(withBreak.studiedWeek).toBe(0)
  })
})
