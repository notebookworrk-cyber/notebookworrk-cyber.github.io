import type { Course, Session } from '../db/types'
import { uid } from '../db/types'
import { dayKey } from './dates'

export interface CalendarEvent {
  uid: string
  title: string
  start: number
  end: number
  allDay: boolean
  location: string
  description: string
}

function parseDateValue(value: string, allDay: boolean): number | null {
  const clean = value.trim()
  if (allDay) {
    const y = Number(clean.slice(0, 4))
    const m = Number(clean.slice(4, 6)) - 1
    const d = Number(clean.slice(6, 8))
    const dt = new Date(y, m, d)
    return Number.isNaN(dt.getTime()) ? null : dt.getTime()
  }
  const y = Number(clean.slice(0, 4))
  const m = Number(clean.slice(4, 6)) - 1
  const d = Number(clean.slice(6, 8))
  const h = Number(clean.slice(9, 11) || '0')
  const min = Number(clean.slice(11, 13) || '0')
  const sec = Number(clean.slice(13, 15) || '0')
  const dt = new Date(y, m, d, h, min, sec)
  return Number.isNaN(dt.getTime()) ? null : dt.getTime()
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

export function parseICS(text: string): CalendarEvent[] {
  const lines = unfold(text)
  const events: CalendarEvent[] = []
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const get = (key: string) => current?.[key]
        const startRaw = get('DTSTART')
        if (startRaw) {
          const allDay = (startRaw.params.VALUE ?? '').toUpperCase() === 'DATE'
          const start = parseDateValue(startRaw.value, allDay)
          if (start != null) {
            const endRaw = get('DTEND')
            const end = endRaw
              ? parseDateValue(endRaw.value, allDay) ?? start + (allDay ? 86_400_000 : 3_600_000)
              : start + (allDay ? 86_400_000 : 3_600_000)
            events.push({
              uid: get('UID')?.value ?? uid(),
              title: get('SUMMARY')?.value ?? 'Untitled event',
              start,
              end,
              allDay,
              location: get('LOCATION')?.value ?? '',
              description: get('DESCRIPTION')?.value ?? '',
            })
          }
        }
      }
      current = null
      continue
    }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const parts = left.split(';')
    const params: Record<string, string> = {}
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=')
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).toUpperCase()
    }
    current[parts[0].toUpperCase()] = { value, params }
  }
  return events
}

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function exportSessionsICS(sessions: Session[], courses: Course[]): string {
  const courseName = new Map(courses.map((c) => [c.id, c.name]))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meridian//Study Observatory//EN',
    'CALSCALE:GREGORIAN',
  ]
  for (const s of sessions) {
    if (s.deletedAt != null || s.minutes <= 0) continue
    const start = new Date(s.startedAt)
    const end = new Date(s.startedAt + s.minutes * 60_000)
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T` +
      `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
    const title = `Focus · ${courseName.get(s.courseId ?? '') ?? 'Study'}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@meridian`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${escapeICS(title)}`,
      `DESCRIPTION:${escapeICS(s.note || `${s.minutes} minutes of ${s.mode}`)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function eventDayKey(event: CalendarEvent): string {
  return dayKey(event.start)
}
