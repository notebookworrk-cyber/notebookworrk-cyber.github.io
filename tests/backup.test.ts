import { beforeEach, describe, expect, it } from 'vitest'
import { db, exportBackup, importBackup, TABLES } from '../src/db/db'
import { stamp } from '../src/db/types'
import { course } from './fixtures'

beforeEach(async () => {
  await Promise.all(TABLES.map((t) => db[t].clear()))
})

describe('local backup', () => {
  it('exports a versioned envelope with counts and no pairing secrets', async () => {
    await db.courses.add(course())
    const envelope = JSON.parse(await exportBackup())
    expect(envelope.app).toBe('meridian')
    expect(envelope.schema).toBe(2)
    expect(envelope.counts.courses).toBe(1)
    expect(envelope.data).not.toHaveProperty('meta')
  })

  it('round-trips records', async () => {
    await db.courses.add(course())
    const json = await exportBackup()
    await db.courses.clear()
    const count = await importBackup(json, 'replace')
    expect(count).toBeGreaterThan(0)
    expect((await db.courses.toArray())[0].name).toBe('Organic Chemistry')
  })

  it('validates every row before writing anything', async () => {
    await db.courses.add(course())
    const broken = JSON.stringify({
      app: 'meridian', schema: 2, data: { courses: [{ id: 'bad' }, { nope: true }] },
    })
    await expect(importBackup(broken, 'replace')).rejects.toThrow(/invalid record/)
    expect(await db.courses.count()).toBe(1)
  })

  it('merge keeps the newer version of a record', async () => {
    const older = { ...course(), name: 'Old name', updatedAt: 100, rev: 1 }
    const newer = { ...course(), name: 'New name', updatedAt: 200, rev: 2 }
    await db.courses.put(older)
    await importBackup(JSON.stringify({ app: 'meridian', schema: 2, data: { courses: [newer] } }), 'merge')
    expect((await db.courses.get('c1'))?.name).toBe('New name')
  })

  it('accepts legacy v1 backups', async () => {
    const row = stamp(course({ id: 'legacy', name: 'Legacy course' }))
    await importBackup(JSON.stringify({ app: 'meridian', data: { courses: [row] } }), 'merge')
    expect((await db.courses.get('legacy'))?.name).toBe('Legacy course')
  })
})
