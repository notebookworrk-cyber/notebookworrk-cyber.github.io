import type { Session } from '../db/types'
import { addDays, dayKey, startOfWeek } from './dates'

export function sessionsByDay(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (s.deletedAt != null) continue
    const key = dayKey(s.startedAt)
    map.set(key, (map.get(key) ?? 0) + s.minutes)
  }
  return map
}

export function streakDays(sessions: Session[]): number {
  const days = sessionsByDay(sessions)
  let streak = 0
  let cursor = new Date()
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1)
  while (days.has(dayKey(cursor))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export interface HeatCell {
  key: string
  minutes: number
  date: Date
}

export function heatmap(sessions: Session[], weeks = 52): HeatCell[][] {
  const totals = sessionsByDay(sessions)
  const end = startOfWeek(new Date())
  const start = addDays(end, -(weeks - 1) * 7)
  const grid: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const week: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      const key = dayKey(date)
      week.push({ key, minutes: totals.get(key) ?? 0, date })
    }
    grid.push(week)
  }
  return grid
}

export function heatLevel(minutes: number): number {
  if (minutes <= 0) return 0
  if (minutes < 25) return 1
  if (minutes < 60) return 2
  if (minutes < 120) return 3
  return 4
}

export function weeklyTotal(sessions: Session[]): number {
  const start = startOfWeek(new Date()).getTime()
  return sessions
    .filter((s) => s.deletedAt == null && s.startedAt >= start)
    .reduce((sum, s) => sum + s.minutes, 0)
}

export function bestDay(sessions: Session[]): { key: string; minutes: number } | null {
  let best: { key: string; minutes: number } | null = null
  for (const [key, minutes] of sessionsByDay(sessions)) {
    if (!best || minutes > best.minutes) best = { key, minutes }
  }
  return best
}

export function courseMinutes(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (s.deletedAt != null) continue
    const key = s.courseId ?? '__none__'
    map.set(key, (map.get(key) ?? 0) + s.minutes)
  }
  return map
}
