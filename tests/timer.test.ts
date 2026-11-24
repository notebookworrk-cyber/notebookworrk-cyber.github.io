import { describe, expect, it, vi } from 'vitest'
import { displayTime, elapsedMs, remainingSeconds, type TimerState } from '../src/features/focus/timer'

const state = (patch: Partial<TimerState> = {}): TimerState => ({
  mode: 'focus', durationMin: 25, running: false, startedAt: null,
  accumulatedMs: 60_000, courseId: null, topicId: null, topicTitle: '',
  plannedMin: 25, firstStartedAt: null, note: '', difficulty: 0,
  confidenceAfter: 0, completed: 0, recovery: null, lastSavedAt: null,
  start: () => {}, setMode: () => {}, resumeOrStart: () => {}, pause: () => {},
  resume: () => {}, reset: () => {}, setCourse: () => {}, setTopic: () => {},
  setDuration: () => {}, retime: () => {}, tick: () => {},
  stopAndSave: async () => null, setNote: () => {}, setReflection: () => {},
  reconcile: () => {}, keepRecovery: async () => null, discardRecovery: () => {},
  ...patch,
})

describe('timer math', () => {
  it('counts only accumulated active time when paused', () => {
    expect(elapsedMs(state())).toBe(60_000)
    expect(remainingSeconds(state())).toBe(24 * 60)
    expect(displayTime(state())).toBe('24:00')
  })

  it('uses timestamps while running, so backgrounding does not lose time', () => {
    const start = 1_000_000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(start + 65_000)
    expect(elapsedMs(state({ running: true, startedAt: start }))).toBe(125_000)
    spy.mockRestore()
  })

  it('clamps remaining time at zero', () => {
    expect(remainingSeconds(state({ accumulatedMs: 30 * 60_000 }))).toBe(0)
    expect(displayTime(state({ accumulatedMs: 30 * 60_000 }))).toBe('00:00')
  })

  it('counts a stopwatch up', () => {
    expect(displayTime(state({ mode: 'stopwatch' }))).toBe('01:00')
  })
})
