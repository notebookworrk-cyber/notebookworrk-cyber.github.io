import type { Course, Recall, Session, Task } from '../db/types'
import { addDays, dayKey, startOfWeek } from './dates'

/** Breaks are deliberately excluded from every attention statistic. */
export const isFocus = (s: Session): boolean =>
  s.deletedAt == null && s.mode !== 'break'

export function sessionsByDay(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (!isFocus(s)) continue
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
    .filter((s) => isFocus(s) && s.startedAt >= start)
    .reduce((sum, s) => sum + s.minutes, 0)
}

export function monthlyTotal(sessions: Session[]): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return sessions
    .filter((s) => isFocus(s) && s.startedAt >= start)
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
    if (!isFocus(s)) continue
    const key = s.courseId ?? '__none__'
    map.set(key, (map.get(key) ?? 0) + s.minutes)
  }
  return map
}

export interface SubjectSlice {
  courseId: string
  name: string
  color: string
  minutes: number
  percent: number
}

export function subjectDistribution(sessions: Session[], courses: Course[]): SubjectSlice[] {
  const totals = courseMinutes(sessions)
  const total = [...totals.values()].reduce((a, b) => a + b, 0)
  const names = new Map(courses.map((c) => [c.id, c]))
  return [...totals.entries()]
    .map(([id, minutes]) => ({
      courseId: id,
      name: id === '__none__' ? 'Unassigned' : names.get(id)?.name ?? 'Unknown course',
      color: id === '__none__' ? '#7d776d' : names.get(id)?.color ?? '#7d776d',
      minutes,
      percent: total ? Math.round((minutes / total) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
}

export interface Consistency {
  activeDays: number
  days: number
  percent: number
}

export function consistency(sessions: Session[], days = 28): Consistency {
  const byDay = sessionsByDay(sessions)
  let active = 0
  for (let i = 0; i < days; i++) {
    if (byDay.has(dayKey(addDays(new Date(), -i)))) active++
  }
  return { activeDays: active, days, percent: Math.round((active / days) * 100) }
}

export function completionRate(tasks: Task[]): { done: number; total: number; percent: number } {
  const open = tasks.filter((t) => t.deletedAt == null)
  const done = open.filter((t) => t.done === 1).length
  return { done, total: open.length, percent: open.length ? Math.round((done / open.length) * 100) : 0 }
}

export interface RecallStats {
  attempts: number
  easy: number
  effort: number
  hard: number
  lost: number
  successRate: number | null
}

export function recallStats(recalls: Recall[]): RecallStats {
  const rows = recalls.filter((r) => r.deletedAt == null)
  const count = (rating: number) => rows.filter((r) => r.rating === rating).length
  const attempts = rows.length
  return {
    attempts,
    easy: count(3),
    effort: count(2),
    hard: count(1),
    lost: count(0),
    successRate: attempts ? Math.round(((count(2) + count(3)) / attempts) * 100) : null,
  }
}

/** True when one subject is taking far more than its share of recent attention. */
export function subjectBalance(sessions: Session[], courses: Course[]): SubjectSlice | null {
  const slices = subjectDistribution(sessions, courses)
  if (slices.length < 2 || slices[0].percent < 45) return null
  return slices[0]
}
