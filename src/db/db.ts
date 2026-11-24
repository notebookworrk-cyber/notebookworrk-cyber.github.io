import Dexie, { type EntityTable } from 'dexie'
import type {
  Assessment,
  Course,
  ID,
  LocalMeta,
  SavedPlan,
  Session,
  Setting,
  Task,
  Topic,
  Unlock,
  Reminder,
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

export async function softDelete(table: TableName, id: ID): Promise<void> {
  const row = await db[table].get(id)
  if (row) {
    await db[table].put({ ...row, deletedAt: Date.now(), updatedAt: Date.now(), rev: row.rev + 1 } as never)
  }
}

export async function exportBackup(): Promise<string> {
  const data: Record<string, unknown> = {}
  for (const t of TABLES) data[t] = await db[t].toArray()
  return JSON.stringify({ app: 'meridian', version: 1, exportedAt: Date.now(), data }, null, 2)
}

export async function importBackup(json: string, mode: 'merge' | 'replace'): Promise<number> {
  const parsed = JSON.parse(json) as {
    app?: string
    data?: Record<string, Record<string, unknown>[]>
  }
  if (parsed.app !== 'meridian' || !parsed.data) throw new Error('Not a Meridian backup')
  let count = 0
  for (const t of TABLES) {
    const rows = parsed.data[t]
    if (!rows) continue
    if (mode === 'replace') await db[t].clear()
    for (const row of rows) {
      const id = (row as { id?: string; key?: string }).id ?? (row as { key: string }).key
      if (!id) continue
      const existing = mode === 'merge' ? await db[t].get(id as never) : undefined
      if (!existing || ((row.updatedAt as number) ?? 0) > existing.updatedAt) {
        await db[t].put(row as never)
        count++
      }
    }
  }
  return count
}
