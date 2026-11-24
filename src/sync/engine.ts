import { create } from 'zustand'
import { db, getMeta, setMeta, TABLES, type TableName } from '../db/db'

export interface SyncState {
  status: 'offline' | 'connecting' | 'synced' | 'syncing' | 'error'
  lastSync: number | null
  message: string
  pending: number
  conflicts: number
  set: (patch: Partial<SyncState>) => void
}

export const useSync = create<SyncState>((set) => ({
  status: 'offline',
  lastSync: null,
  message: 'Not paired',
  pending: 0,
  conflicts: 0,
  set: (patch) => set(patch),
}))

export interface Pairing {
  url: string
  token: string
}

export async function getPairing(): Promise<Pairing | null> {
  const url = await getMeta('serverUrl')
  const token = await getMeta('pairToken')
  return url && token ? { url, token } : null
}

export async function setPairing(p: Pairing): Promise<void> {
  await setMeta('serverUrl', p.url.replace(/\/$/, ''))
  await setMeta('pairToken', p.token)
}

export async function clearPairing(): Promise<void> {
  await setMeta('serverUrl', '')
  await setMeta('pairToken', '')
  useSync.getState().set({ status: 'offline', message: 'Not paired', lastSync: null })
}

function headers(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Meridian-Token': token }
}

export async function testConnection(p: Pairing): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const res = await fetch(`${p.url}/api/health`, {
      headers: headers(p.token),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return { ok: false, error: `Server returned ${res.status}` }
    const body = (await res.json()) as { ok?: boolean; name?: string }
    return { ok: body.ok === true, name: body.name }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unreachable' }
  }
}

type ChangeMap = Partial<Record<TableName, Record<string, unknown>[]>>

export async function syncNow(): Promise<void> {
  const pairing = await getPairing()
  if (!pairing) {
    useSync.getState().set({ status: 'offline', message: 'Not paired' })
    return
  }
  const s = useSync.getState()
  s.set({ status: 'syncing', message: 'Syncing…' })
  try {
    const since = Number((await getMeta('syncCursor')) ?? 0)
    const outgoing: ChangeMap = {}
    let pending = 0
    for (const table of TABLES) {
      const rows = await db[table].filter((r) => r.updatedAt > since).toArray()
      if (rows.length) {
        outgoing[table] = rows as unknown as Record<string, unknown>[]
        pending += rows.length
      }
    }
    s.set({ pending })

    const pushRes = await fetch(`${pairing.url}/api/push`, {
      method: 'POST',
      headers: headers(pairing.token),
      body: JSON.stringify({ changes: outgoing }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!pushRes.ok) throw new Error(`Push failed (${pushRes.status})`)
    const pushed = (await pushRes.json()) as {
      cursor?: number
      authoritative?: ChangeMap
      conflicts?: number
    }

    const pullRes = await fetch(
      `${pairing.url}/api/pull?since=${encodeURIComponent(String(pushed.cursor ?? since))}`,
      { headers: headers(pairing.token), signal: AbortSignal.timeout(15_000) },
    )
    if (!pullRes.ok) throw new Error(`Pull failed (${pullRes.status})`)
    const pulled = (await pullRes.json()) as { changes: ChangeMap; cursor: number }

    const incoming = { ...(pulled.changes ?? {}), ...(pushed.authoritative ?? {}) }
    let applied = 0
    for (const table of TABLES) {
      const rows = incoming[table]
      if (!rows?.length) continue
      for (const row of rows) {
        const id = row.id as string | undefined
        if (!id) continue
        const local = await db[table].get(id as never)
        if (!local || (row.updatedAt as number) > local.updatedAt) {
          await db[table].put(row as never)
          applied++
        }
      }
    }

    const cursor = Math.max(pulled.cursor ?? 0, pushed.cursor ?? 0, Date.now() - 1000)
    await setMeta('syncCursor', String(cursor))
    useSync.getState().set({
      status: 'synced',
      message: applied ? `Synced · ${applied} updated` : 'Up to date',
      lastSync: Date.now(),
      pending: 0,
      conflicts: pushed.conflicts ?? 0,
    })
  } catch (e) {
    useSync.getState().set({
      status: 'error',
      message: e instanceof Error ? e.message : 'Sync failed',
    })
  }
}

export function startAutoSync(intervalMs = 30_000): () => void {
  void syncNow()
  const timer = window.setInterval(() => {
    if (navigator.onLine) void syncNow()
  }, intervalMs)
  const onOnline = () => void syncNow()
  window.addEventListener('online', onOnline)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('online', onOnline)
  }
}
