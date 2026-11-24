import { db } from '../../db/db'
import { stamp, touch, uid, type Assessment, type Reminder, type Task } from '../../db/types'
import { DAY, fromLocalInput } from '../../lib/dates'
import { setSetting } from '../../db/db'
import { getPairing } from '../../sync/engine'

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.permission === 'denied' ? 'denied' : Notification.requestPermission()
}

export async function notify(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `meridian-${title}`,
      })
      return
    }
    new Notification(title, { body, icon: '/icon-192.png' })
  } catch {
    // Notification surface is best-effort by design.
  }
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function pushSupported(): Promise<boolean> {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext
}

export async function enableBackgroundPush(): Promise<{ ok: boolean; message: string }> {
  if (!(await pushSupported())) return { ok: false, message: 'Background push needs a secure, installed PWA.' }
  const permission = await requestNotifications()
  if (permission !== 'granted') return { ok: false, message: 'Notification permission was not granted.' }
  const pairing = await getPairing()
  if (!pairing) return { ok: false, message: 'Pair with the sync server first.' }
  try {
    const keyRes = await fetch(`${pairing.url}/api/push/key`)
    const { publicKey } = (await keyRes.json()) as { publicKey: string }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    })
    const subRes = await fetch(`${pairing.url}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Meridian-Token': pairing.token },
      body: JSON.stringify({ subscription }),
    })
    if (!subRes.ok) return { ok: false, message: `Server rejected subscription (${subRes.status})` }
    return { ok: true, message: 'Background push enabled.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not subscribe' }
  }
}

export async function disableBackgroundPush(): Promise<void> {
  const pairing = await getPairing()
  if (!pairing || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await fetch(`${pairing.url}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Meridian-Token': pairing.token },
    body: JSON.stringify({ endpoint }),
  })
}

export async function checkReminders(): Promise<void> {
  const due = await db.reminders
    .filter((r) => r.deletedAt == null && r.enabled === 1 && r.at <= Date.now() && (!r.lastFired || r.lastFired < r.at - 60_000))
    .toArray()
  for (const r of due) {
    await notify(r.title, r.note || 'Meridian reminder')
    await db.reminders.put(touch({ ...r, lastFired: Date.now() }))
  }
}

export async function seedReminders(tasks: Task[], assessments: Assessment[]): Promise<number> {
  const existing = await db.reminders.filter((r) => r.deletedAt == null).toArray()
  const seen = new Set(existing.map((r) => `${r.kind}:${r.at}:${r.title}`))
  let added = 0
  const add = (title: string, kind: Reminder['kind'], at: number, note: string) => {
    const key = `${kind}:${at}:${title}`
    if (seen.has(key) || at <= Date.now()) return
    seen.add(key)
    void db.reminders.add(stamp({ id: uid(), title, kind, at, enabled: 1, lastFired: null, note }))
    added++
  }

  for (const t of tasks) {
    if (!t.done && t.dueAt) add(`Due today: ${t.title}`, 'task', t.dueAt - 15 * 60_000, 'A task is coming up in 15 minutes.')
  }
  for (const a of assessments) {
    if (!a.dueAt) continue
    for (const days of [7, 3, 1]) {
      add(`${a.title} in ${days} day${days > 1 ? 's' : ''}`, 'exam', a.dueAt - days * DAY, `${a.title} is coming up. Time to review.`)
    }
  }
  const goal = Number((await db.settings.filter((s) => s.key === 'dailyGoal').first())?.value ?? 120)
  const tonight = new Date()
  tonight.setHours(20, 0, 0, 0)
  add('Streak at risk', 'streak', tonight.getTime(), `You still have ${goal} focus minutes to reach today's goal.`)
  return added
}

function icsDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

export function remindersToICS(reminders: Reminder[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meridian//Reminders//EN', 'CALSCALE:GREGORIAN']
  for (const r of reminders) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@meridian`,
      `DTSTAMP:${icsDate(Date.now())}`,
      `DTSTART:${icsDate(r.at)}`,
      `DTEND:${icsDate(r.at + 15 * 60_000)}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(r.note || 'Meridian reminder')}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(r.title)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export async function setGoalReminderTime(value: string): Promise<void> {
  await setSetting('reminderHour', value)
}

export function parseHour(value: string): number {
  const parsed = Number(fromLocalInput(value))
  return Number.isNaN(parsed) ? 20 : new Date(parsed).getHours()
}
