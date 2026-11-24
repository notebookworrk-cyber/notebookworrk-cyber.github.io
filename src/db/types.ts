export type ID = string

export interface SyncedRecord {
  id: ID
  updatedAt: number
  deletedAt: number | null
  rev: number
}

export interface Course extends SyncedRecord {
  name: string
  code: string
  credits: number
  color: string
  teacher: string
  semester: string
  createdAt: number
}

export type AssessmentKind = 'exam' | 'quiz' | 'assignment' | 'project' | 'presentation'

export interface Assessment extends SyncedRecord {
  courseId: ID | null
  title: string
  kind: AssessmentKind
  weight: number
  dueAt: number | null
  score: number | null
  maxScore: number
  note: string
}

export interface Topic extends SyncedRecord {
  courseId: ID
  title: string
  confidence: number
  done: number
}

export interface Task extends SyncedRecord {
  title: string
  courseId: ID | null
  dueAt: number | null
  priority: number
  estimateMin: number
  done: number
  note: string
}

export type FocusMode = 'focus' | 'stopwatch' | 'break'

export interface Session extends SyncedRecord {
  courseId: ID | null
  mode: FocusMode
  startedAt: number
  endedAt: number
  minutes: number
  note: string
}

export interface SavedPlan extends SyncedRecord {
  title: string
  createdAt: number
  payload: string
}

export interface Setting extends SyncedRecord {
  key: string
  value: string
}

export interface Unlock extends SyncedRecord {
  app: string
  at: number
  minutes: number
  context: string
}

export type ReminderKind = 'task' | 'exam' | 'goal' | 'streak' | 'session' | 'custom'

export interface Reminder extends SyncedRecord {
  title: string
  kind: ReminderKind
  at: number
  enabled: number
  lastFired: number | null
  note: string
}

export interface LocalMeta {
  key: string
  value: string
}

export const uid = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function stamp<T extends object>(record: T): T & SyncedRecord {
  return {
    ...record,
    updatedAt: Date.now(),
    deletedAt: null,
    rev: 1,
  } as T & SyncedRecord
}

export function touch<T extends SyncedRecord>(record: T): T {
  return { ...record, updatedAt: Date.now(), rev: record.rev + 1 }
}
