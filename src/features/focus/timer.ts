import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '../../db/db'
import { stamp, uid, type FocusMode, type ID, type Session } from '../../db/types'

export type TimerMode = 'focus' | 'break' | 'stopwatch'

const HOUR = 3_600_000
const MAX_SESSION = 4 * HOUR
const MAX_WALL = 6 * HOUR

export interface TimerRecovery {
  ms: number
  wall: number
  at: number
}

interface TimerState {
  mode: TimerMode
  durationMin: number
  running: boolean
  startedAt: number | null
  accumulatedMs: number
  courseId: ID | null
  topicId: ID | null
  topicTitle: string
  plannedMin: number
  firstStartedAt: number | null
  note: string
  difficulty: number
  confidenceAfter: number
  completed: number
  recovery: TimerRecovery | null
  lastSavedAt: number | null
  start: (mode: TimerMode, minutes: number, courseId?: ID | null, topicId?: ID | null, topicTitle?: string) => void
  setMode: (mode: TimerMode) => void
  resumeOrStart: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  setCourse: (id: ID | null) => void
  setTopic: (id: ID | null, title?: string) => void
  setDuration: (minutes: number) => void
  retime: (minutes: number) => void
  tick: () => void
  stopAndSave: () => Promise<Session | null>
  setNote: (note: string) => void
  setReflection: (note: string, difficulty: number, confidenceAfter: number) => void
  reconcile: () => void
  keepRecovery: () => Promise<Session | null>
  discardRecovery: () => void
}

export function elapsedMs(s: Pick<TimerState, 'running' | 'startedAt' | 'accumulatedMs'>): number {
  return s.accumulatedMs + (s.running && s.startedAt != null ? Date.now() - s.startedAt : 0)
}

export function remainingSeconds(s: TimerState): number {
  const total = s.durationMin * 60_000
  return Math.max(0, Math.ceil((total - elapsedMs(s)) / 1000))
}

function clear(): Pick<TimerState, 'running' | 'startedAt' | 'accumulatedMs' | 'firstStartedAt' | 'recovery'> {
  return { running: false, startedAt: null, accumulatedMs: 0, firstStartedAt: null, recovery: null }
}

/** One write per completion, even if tick and hold-to-bank fire together. */
let saving: Promise<Session | null> | null = null

function commit(s: TimerState, ms: number, endedAt: number, completed: boolean): Promise<Session | null> {
  if (saving) return saving
  if (ms < 60_000) {
    useTimer.setState({ ...clear(), lastSavedAt: null })
    return Promise.resolve(null)
  }
  const session: Session = stamp({
    id: uid(),
    courseId: s.courseId,
    topicId: s.topicId,
    mode: s.mode as FocusMode,
    // The true first start, so pauses no longer shift the block on the timeline.
    startedAt: s.firstStartedAt ?? endedAt - ms,
    endedAt,
    minutes: Math.max(1, Math.round(ms / 60_000)),
    note: s.note,
    plannedMin: s.plannedMin || s.durationMin,
    completed: completed ? 1 : 0,
    difficulty: s.difficulty,
    confidenceAfter: s.confidenceAfter,
  })
  saving = db.sessions.add(session)
    .then(() => {
      useTimer.setState({
        ...clear(),
        note: '',
        difficulty: 0,
        confidenceAfter: 0,
        completed: 0,
        lastSavedAt: Date.now(),
      })
      return session
    })
    .finally(() => {
      saving = null
    })
  return saving
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
      topicId: null,
      topicTitle: '',
      plannedMin: 25,
      firstStartedAt: null,
      note: '',
      difficulty: 0,
      confidenceAfter: 0,
      completed: 0,
      recovery: null,
      lastSavedAt: null,

      start: (mode, minutes, courseId = null, topicId = null, topicTitle = '') =>
        set({
          mode,
          durationMin: Math.max(1, minutes),
          plannedMin: Math.max(1, minutes),
          courseId,
          topicId,
          topicTitle,
          running: true,
          startedAt: Date.now(),
          firstStartedAt: Date.now(),
          accumulatedMs: 0,
          note: '',
          difficulty: 0,
          confidenceAfter: 0,
          completed: 0,
          recovery: null,
        }),
      setMode: (mode) => set({ mode, ...clear(), topicId: null, topicTitle: '' }),
      resumeOrStart: () => {
        const s = get()
        if (s.running) return
        set({
          running: true,
          startedAt: Date.now(),
          firstStartedAt: s.firstStartedAt ?? Date.now(),
          accumulatedMs: s.accumulatedMs,
        })
      },
      pause: () => {
        const s = get()
        if (!s.running) return
        set({ accumulatedMs: elapsedMs(s), running: false, startedAt: null })
      },
      resume: () => {
        const s = get()
        if (s.running) return
        set({
          running: true,
          startedAt: Date.now(),
          firstStartedAt: s.firstStartedAt ?? Date.now(),
        })
      },
      reset: () => set({ ...clear(), note: '', difficulty: 0, confidenceAfter: 0 }),
      setCourse: (courseId) => set({ courseId }),
      setTopic: (topicId, topicTitle = '') => set({ topicId, topicTitle }),
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
        if (!s.running || s.mode === 'stopwatch' || s.recovery) return
        if (remainingSeconds(s) <= 0) void commit(s, elapsedMs(s), Date.now(), true)
      },
      stopAndSave: () => {
        const s = get()
        return commit(s, elapsedMs(s), Date.now(), false)
      },
      setNote: (note) => set({ note }),
      setReflection: (note, difficulty, confidenceAfter) => set({ note, difficulty, confidenceAfter }),

      /** Called once at startup: a session suspended for hours must not bank days. */
      reconcile: () => {
        const s = get()
        if (!s.running || s.startedAt == null || s.recovery) return
        const wall = Date.now() - s.startedAt
        if (wall < 0) {
          set({ startedAt: Date.now() })
          return
        }
        const elapsed = elapsedMs(s)
        if (wall > MAX_WALL || elapsed > MAX_SESSION) {
          set({
            running: false,
            startedAt: null,
            accumulatedMs: Math.min(elapsed, MAX_SESSION),
            recovery: { ms: Math.min(elapsed, MAX_SESSION), wall, at: Date.now() },
          })
        }
      },
      keepRecovery: () => {
        const s = get()
        if (!s.recovery) return Promise.resolve(null)
        return commit(s, s.recovery.ms, Date.now(), false)
      },
      discardRecovery: () => set({ ...clear(), note: '', difficulty: 0, confidenceAfter: 0 }),
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
        topicId: s.topicId,
        topicTitle: s.topicTitle,
        plannedMin: s.plannedMin,
        firstStartedAt: s.firstStartedAt,
        note: s.note,
        difficulty: s.difficulty,
        confidenceAfter: s.confidenceAfter,
        completed: s.completed,
        recovery: s.recovery,
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
