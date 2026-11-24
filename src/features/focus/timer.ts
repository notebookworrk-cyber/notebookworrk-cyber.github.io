import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '../../db/db'
import { stamp, type ID, type FocusMode, type Session } from '../../db/types'

export type TimerMode = 'focus' | 'break' | 'stopwatch'

interface TimerState {
  mode: TimerMode
  durationMin: number
  running: boolean
  startedAt: number | null
  accumulatedMs: number
  courseId: ID | null
  lastSavedAt: number | null
  start: (mode: TimerMode, minutes: number, courseId?: ID | null) => void
  setMode: (mode: TimerMode) => void
  resumeOrStart: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  setCourse: (id: ID | null) => void
  setDuration: (minutes: number) => void
  retime: (minutes: number) => void
  tick: () => void
  stopAndSave: () => Promise<Session | null>
}

export function elapsedMs(s: Pick<TimerState, 'running' | 'startedAt' | 'accumulatedMs'>): number {
  return s.accumulatedMs + (s.running && s.startedAt != null ? Date.now() - s.startedAt : 0)
}

export function remainingSeconds(s: TimerState): number {
  const total = s.durationMin * 60_000
  return Math.max(0, Math.ceil((total - elapsedMs(s)) / 1000))
}

function clear(): Pick<TimerState, 'running' | 'startedAt' | 'accumulatedMs'> {
  return { running: false, startedAt: null, accumulatedMs: 0 }
}

function sessionFrom(s: TimerState, ms: number, endedAt = Date.now()): Session {
  return stamp({
    id: crypto.randomUUID(),
    courseId: s.courseId,
    mode: s.mode as FocusMode,
    startedAt: endedAt - ms,
    endedAt,
    minutes: Math.max(1, Math.round(ms / 60_000)),
    note: '',
  })
}

export const useTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      mode: 'focus',
      durationMin: 25,
      running: false,
      startedAt: null,
      accumulatedMs: 0,
      courseId: null,
      lastSavedAt: null,
      start: (mode, minutes, courseId = null) =>
        set({
          mode,
          durationMin: Math.max(1, minutes),
          courseId,
          running: true,
          startedAt: Date.now(),
          accumulatedMs: 0,
        }),
      setMode: (mode) => set({ mode, ...clear() }),
      resumeOrStart: () => {
        const s = get()
        if (s.running) return
        if (s.accumulatedMs > 0) set({ running: true, startedAt: Date.now() })
        else set({ running: true, startedAt: Date.now(), accumulatedMs: 0 })
      },
      pause: () => {
        const s = get()
        if (!s.running) return
        set({ accumulatedMs: elapsedMs(s), running: false, startedAt: null })
      },
      resume: () => {
        const s = get()
        if (s.running) return
        set({ running: true, startedAt: Date.now() })
      },
      reset: () => set(clear()),
      setCourse: (courseId) => set({ courseId }),
      setDuration: (durationMin) => {
        const s = get()
        if (s.running) return
        set({ durationMin: Math.max(1, durationMin), ...clear() })
      },
      retime: (minutes) => {
        const s = get()
        const elapsedMin = Math.ceil(elapsedMs(s) / 60_000)
        set({ durationMin: Math.max(elapsedMin + 1, minutes) })
      },
      tick: () => {
        const s = get()
        if (!s.running || s.mode === 'stopwatch') return
        if (remainingSeconds(s) <= 0) {
          const ms = elapsedMs(s)
          set({ ...clear(), lastSavedAt: Date.now() })
          if (ms >= 60_000) void db.sessions.add(sessionFrom(s, ms))
        }
      },
      stopAndSave: async () => {
        const s = get()
        const ms = elapsedMs(s)
        if (ms < 60_000) {
          set(clear())
          return null
        }
        const session = sessionFrom(s, ms)
        await db.sessions.add(session)
        set({ ...clear(), lastSavedAt: Date.now() })
        return session
      },
    }),
    {
      name: 'meridian:timer',
      partialize: (s) => ({
        mode: s.mode,
        durationMin: s.durationMin,
        running: s.running,
        startedAt: s.startedAt,
        accumulatedMs: s.accumulatedMs,
        courseId: s.courseId,
        lastSavedAt: s.lastSavedAt,
      }),
    },
  ),
)

export function displayTime(s: TimerState): string {
  const seconds = s.mode === 'stopwatch' ? Math.floor(elapsedMs(s) / 1000) : remainingSeconds(s)
  const m = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
