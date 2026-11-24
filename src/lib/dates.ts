export const DAY = 86_400_000

export function dayKey(input: number | Date = Date.now()): string {
  const d = input instanceof Date ? input : new Date(input)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(input: number | Date, days: number): Date {
  const d = input instanceof Date ? new Date(input) : new Date(input)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfWeek(input: number | Date = Date.now(), weekStartsOn = 1): Date {
  const d = input instanceof Date ? new Date(input) : new Date(input)
  const diff = (d.getDay() - weekStartsOn + 7) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - diff)
  return d
}

export function fmtTime(ts: number | null): string {
  if (ts == null) return '—'
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(ts: number | null): string {
  if (ts == null) return 'No date'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtFullDate(ts: number | null): string {
  if (ts == null) return 'No date'
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function dueLabel(ts: number | null): string {
  if (ts == null) return 'No deadline'
  const days = Math.ceil((ts - Date.now()) / DAY)
  if (days < -1) return `${Math.abs(days)}d overdue`
  if (days === -1) return 'Yesterday'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

export function minutesToHM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (!h) return `${m}m`
  if (!m) return `${h}h`
  return `${h}h ${m}m`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function toLocalInput(ts: number | null): string {
  if (ts == null) return ''
  const d = new Date(ts)
  const off = d.getTimezoneOffset() * 60_000
  return new Date(ts - off).toISOString().slice(0, 16)
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? null : ts
}

export function uniqueCourseColors(): string[] {
  return ['#9a5f3c', '#4f6b4a', '#3e5c76', '#8a6a2f', '#6b4a5c', '#7a5c3e', '#4a6b63', '#8c4a3c']
}
