import { describe, expect, it } from 'vitest'
import { isFocus, sessionsByDay, streakDays, subjectDistribution, weeklyTotal } from '../src/lib/stats'
import { course, now, session } from './fixtures'
import { dayKey } from '../src/lib/dates'

describe('attention statistics', () => {
  it('excludes breaks from every focus total', () => {
    const sessions = [session({ minutes: 50 }), session({ id: 'b', minutes: 90, mode: 'break' })]
    expect(sessions.filter(isFocus)).toHaveLength(1)
    expect(sessionsByDay(sessions).get(dayKey(now - 86_400_000))).toBe(50)
    expect(weeklyTotal(sessions)).toBe(50)
  })

  it('does not award a streak for break-only days', () => {
    expect(streakDays([session({ minutes: 30, mode: 'break' })])).toBe(0)
  })

  it('attributes focus time to the right subject', () => {
    const sessions = [session({ minutes: 50, courseId: 'c1' })]
    expect(subjectDistribution(sessions, [course()])[0]).toMatchObject({ name: 'Organic Chemistry', minutes: 50, percent: 100 })
  })
})
