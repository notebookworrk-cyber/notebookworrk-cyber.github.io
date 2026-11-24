import Dexie, { type EntityTable } from 'dexie'
import type {
  Assessment,
  Commitment,
  Course,
  ID,
  LocalMeta,
  Recall,
  SavedPlan,
  Session,
  Setting,
  Task,
  Topic,
  Unlock,
  Reminder,
  Note,
  StoredFile,
} from './types'

export interface MeridianDB extends Dexie {
  courses: EntityTable<Course, 'id'>
  assessments: EntityTable<Assessment, 'id'>
  topics: EntityTable<Topic, 'id'>
  tasks: EntityTable<Task, 'id'>
  sessions: EntityTable<Session, 'id'>
  plans: EntityTable<SavedPlan, 'id'>
  settings: EntityTable<Setting, 'id'>
  unlocks: EntityTable<Unlock, 'id'>
  reminders: EntityTable<Reminder, 'id'>
  recalls: EntityTable<Recall, 'id'>
  commitments: EntityTable<Commitment, 'id'>
  notes: EntityTable<Note, 'id'>
  files: EntityTable<StoredFile, 'id'>
  meta: EntityTable<LocalMeta, 'key'>
}

export const db = new Dexie('meridian') as MeridianDB

db.version(1).stores({
  courses: 'id, updatedAt, deletedAt, semester',
  assessments: 'id, updatedAt, deletedAt, courseId, dueAt',
  topics: 'id, updatedAt, deletedAt, courseId',
  tasks: 'id, updatedAt, deletedAt, courseId, dueAt, done',
  sessions: 'id, updatedAt, deletedAt, courseId, startedAt',
  plans: 'id, updatedAt, deletedAt, createdAt',
  settings: 'id, updatedAt, key',
  meta: 'key',
})

db.version(2).stores({
  unlocks: 'id, at, app, updatedAt, deletedAt',
  reminders: 'id, at, enabled, updatedAt, deletedAt',
})

// v3 adds Chapter Intelligence and fixed commitments. Schema-only changes:
// old records keep their values; new fields are optional and default at read time.
db.version(3).stores({
  courses: 'id, updatedAt, deletedAt, semester',
  assessments: 'id, updatedAt, deletedAt, courseId, dueAt',
  topics: 'id, updatedAt, deletedAt, courseId, nextReviewAt',
  tasks: 'id, updatedAt, deletedAt, courseId, topicId, dueAt, done',
  sessions: 'id, updatedAt, deletedAt, courseId, topicId, startedAt',
  plans: 'id, updatedAt, deletedAt, createdAt',
  settings: 'id, updatedAt, key',
  unlocks: 'id, at, app, updatedAt, deletedAt',
  reminders: 'id, at, enabled, updatedAt, deletedAt',
  recalls: 'id, updatedAt, deletedAt, topicId, at, nextDueAt',
  commitments: 'id, updatedAt, deletedAt, kind',
  meta: 'key',
})

// v4 adds the Notes binder. Schema-only; existing records are untouched.
// Files are deliberately excluded from TABLES: backups JSON-serialize rows,
// and a Blob would silently become {}. Attachments stay on this device.
db.version(4).stores({
  courses: 'id, updatedAt, deletedAt, semester',
  assessments: 'id, updatedAt, deletedAt, courseId, dueAt',
  topics: 'id, updatedAt, deletedAt, courseId, nextReviewAt',
  tasks: 'id, updatedAt, deletedAt, courseId, topicId, dueAt, done',
  sessions: 'id, updatedAt, deletedAt, courseId, topicId, startedAt',
  plans: 'id, updatedAt, deletedAt, createdAt',
  settings: 'id, updatedAt, key',
  unlocks: 'id, at, app, updatedAt, deletedAt',
  reminders: 'id, at, enabled, updatedAt, deletedAt',
  recalls: 'id, updatedAt, deletedAt, topicId, at, nextDueAt',
  commitments: 'id, updatedAt, deletedAt, kind',
  notes: 'id, updatedAt, deletedAt, courseId, topicId, kind, pinned',
  files: 'id, updatedAt, deletedAt, noteId',
  meta: 'key',
})

export const TABLES = [
  'courses',
  'assessments',
  'topics',
  'tasks',
  'sessions',
  'plans',
  'settings',
  'unlocks',
  'reminders',
  'recalls',
  'commitments',
] as const

export type TableName = (typeof TABLES)[number]

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const rows = await db.settings.filter((s) => s.key === key && s.deletedAt == null).toArray()
  return rows[0]?.value ?? fallback
}

export async function setSetting(key: string, value: string): Promise<void> {
  const rows = await db.settings.filter((s) => s.key === key && s.deletedAt == null).toArray()
  const existing = rows[0]
  if (existing) {
    await db.settings.put({ ...existing, value, updatedAt: Date.now(), rev: existing.rev + 1 })
  } else {
    await db.settings.add({
      id: crypto.randomUUID(),
      key,
      value,
      updatedAt: Date.now(),
      deletedAt: null,
      rev: 1,
    })
  }
}

export async function softDelete(table: TableName | 'notes' | 'files', id: ID): Promise<void> {
  const row = await db[table].get(id)
  if (row) {
    await db[table].put({ ...row, deletedAt: Date.now(), updatedAt: Date.now(), rev: row.rev + 1 } as never)
  }
}

export interface BackupEnvelope {
  app: 'meridian'
  schema: 2
  exportedAt: number
  counts: Record<string, number>
  data: Record<string, Record<string, unknown>[]>
}

/** Local-only backup. Meta (pairing token, sync cursor) is deliberately excluded. */
export async function exportBackup(): Promise<string> {
  const data: Record<string, Record<string, unknown>[]> = {}
  const counts: Record<string, number> = {}
  for (const t of TABLES) {
    const rows = await db[t].toArray()
    data[t] = rows as unknown as Record<string, unknown>[]
    counts[t] = rows.length
  }
  return JSON.stringify({ app: 'meridian', schema: 2, exportedAt: Date.now(), counts, data }, null, 2)
}

function validRow(table: string, row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return false
  if (r.updatedAt != null && typeof r.updatedAt !== 'number') return false
  if (r.deletedAt != null && typeof r.deletedAt !== 'number') return false
  void table
  return true
}

function parseBackup(json: string): BackupEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('That file is not a Meridian backup')
  const env = parsed as Partial<BackupEnvelope>
  if (env.app !== 'meridian' || !env.data || typeof env.data !== 'object') {
    throw new Error('That file is not a Meridian backup')
  }
  // Validate every row before touching the database — no partial restores.
  for (const [table, rows] of Object.entries(env.data)) {
    if (!(TABLES as readonly string[]).includes(table)) continue
    if (!Array.isArray(rows)) throw new Error(`Backup table "${table}" is malformed`)
    for (const row of rows) {
      if (!validRow(table, row)) throw new Error(`Backup contains an invalid record in ${table}`)
    }
  }
  return env as BackupEnvelope
}

/** Merge or replace, atomically. v1 backups (no schema field) remain importable. */
export async function importBackup(json: string, mode: 'merge' | 'replace'): Promise<number> {
  const parsed = parseBackup(json)
  const tables = TABLES.map((t) => db[t])
  return db.transaction('rw', tables, async () => {
    let count = 0
    if (mode === 'replace') {
      for (const table of TABLES) await db[table].clear()
    }
    for (const table of TABLES) {
      const rows = parsed.data[table]
      if (!rows?.length) continue
      for (const row of rows) {
        const id = row.id as string
        const existing = mode === 'merge' ? await db[table].get(id as never) : undefined
        const incomingAt = typeof row.updatedAt === 'number' ? row.updatedAt : 0
        if (!existing || incomingAt > existing.updatedAt) {
          await db[table].put(row as never)
          count++
        }
      }
    }
    return count
  })
}
