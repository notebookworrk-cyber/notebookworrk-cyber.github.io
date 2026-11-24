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

/** A chapter. New fields are optional so pre-v3 records upgrade without fabrication. */
export interface Topic extends SyncedRecord {
  courseId: ID
  title: string
  confidence: number
  done: number
  note?: string
  estimateMin?: number
  lastStudiedAt?: number | null
  lastRecallAt?: number | null
  nextReviewAt?: number | null
  reviewInterval?: number
  recallCount?: number
  lapses?: number
}

export interface Task extends SyncedRecord {
  title: string
  courseId: ID | null
  topicId?: ID | null
  dueAt: number | null
  priority: number
  estimateMin: number
  done: number
  note: string
  /** 'manual' | 'rebuild:<id>' | 'rescue:<id>' — generated blocks can be replaced safely. */
  source?: string
  planId?: string
}

export type FocusMode = 'focus' | 'stopwatch' | 'break'

export interface Session extends SyncedRecord {
  courseId: ID | null
  topicId?: ID | null
  mode: FocusMode
  startedAt: number
  endedAt: number
  minutes: number
  note: string
  plannedMin?: number
  completed?: number
  difficulty?: number
  confidenceAfter?: number
}

/** A normalised ink stroke: coordinates are 0..1 of the page, so zoom never moves it. */
export interface InkStroke {
  page: number
  tool: 'pen' | 'highlighter'
  color: string
  width: number
  points: [number, number, number][]
}

/** A page in the Notes binder. Text and ink coexist; files are stored separately. */
export interface Note extends SyncedRecord {
  title: string
  body: string
  courseId: ID | null
  topicId: ID | null
  kind: 'text' | 'file'
  /** Stored file id when kind === 'file'. */
  fileId: ID | null
  mime: string
  name: string
  ink: InkStroke[]
  pinned: number
  tags: string[]
}

/** An imported attachment. Blobs stay in IndexedDB and are never put in a backup. */
export interface StoredFile extends SyncedRecord {
  name: string
  mime: string
  size: number
  blob: Blob
  noteId: ID | null
}

export type RecallRating = 0 | 1 | 2 | 3
export type RecallMethod = 'explain' | 'written' | 'questions' | 'confidence'

/** One active-recall attempt. The only source of revision scheduling truth. */
export interface Recall extends SyncedRecord {
  topicId: ID
  courseId: ID | null
  at: number
  rating: RecallRating
  method: RecallMethod
  answer: string
  confidenceAfter: number
  nextDueAt: number
  intervalDays: number
}

export type CommitmentKind = 'class' | 'coaching' | 'work' | 'personal' | 'break' | 'travel'

/** A fixed weekly commitment. Times are minutes from midnight; days are 0=Sun…6=Sat. */
export interface Commitment extends SyncedRecord {
  title: string
  kind: CommitmentKind
  days: number[]
  startMin: number
  endMin: number
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

export type ReminderKind = 'task' | 'exam' | 'goal' | 'streak' | 'session' | 'revision' | 'custom'

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
