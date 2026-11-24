import { describe, expect, it } from 'vitest'
import { buildSchedule, rescueDay } from '../src/lib/scheduler'
import { assessment, commitment, course, now, topic } from './fixtures'

const base = {
  now,
  topics: [topic()],
  tasks: [],
  assessments: [assessment()],
  courses: [course()],
  commitments: [commitment()],
  sessions: [],
  recalls: [],
  horizonDays: 1,
  minutesPerDay: 120,
  intensity: 1,
}

describe('buildSchedule', () => {
  it('never places study inside a fixed commitment or a meal break', () => {
    const preview = buildSchedule(base)
    expect(preview.blocks.length).toBeGreaterThan(0)
    const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b
    for (const block of preview.blocks) {
      const end = block.startMin + block.minutes
      expect(overlaps(block.startMin, end, 9 * 60, 11 * 60)).toBe(false)
      expect(overlaps(block.startMin, end, 12 * 60, 13 * 60)).toBe(false)
      expect(overlaps(block.startMin, end, 18 * 60, 19 * 60)).toBe(false)
    }
  })

  it('never exceeds the available capacity', () => {
    const preview = buildSchedule(base)
    expect(preview.totalMinutes).toBeLessThanOrEqual(120)
    expect(preview.days[0].fixed).toBe(120)
  })

  it('explains why each block was chosen', () => {
    const preview = buildSchedule(base)
    expect(preview.blocks[0].reason.length).toBeGreaterThan(3)
    expect(preview.blocks[0].reason).toMatch(/confidence|exam/)
  })

  it('spreads work across the horizon', () => {
    const preview = buildSchedule({
      ...base,
      topics: [topic({ id: 't1' }), topic({ id: 't2' }), topic({ id: 't3' })],
      horizonDays: 3,
      minutesPerDay: 35,
    })
    expect(new Set(preview.blocks.map((b) => b.day)).size).toBe(3)
  })
})

describe('rescueDay', () => {
  it('preserves fixed commitments and completed sessions', () => {
    const result = rescueDay({
      ...base,
      sessions: [{
        id: 'done', courseId: 'c1', mode: 'focus',
        startedAt: now - 60 * 60_000, endedAt: now - 35 * 60_000,
        minutes: 25, note: '', updatedAt: now, deletedAt: null, rev: 1,
      }],
    })
    expect(result.kept.some((k) => k.title === 'College')).toBe(true)
    expect(result.kept.some((k) => k.reason === 'already completed')).toBe(true)
    expect(result.preview.blocks.every((b) => b.startMin >= 11 * 60)).toBe(true)
  })

  it('reports deferred work instead of deleting it', () => {
    const result = rescueDay({ ...base, minutesPerDay: 5 })
    expect(result.preview.blocks.length).toBe(0)
    expect(result.deferred.length).toBeGreaterThan(0)
  })
})
