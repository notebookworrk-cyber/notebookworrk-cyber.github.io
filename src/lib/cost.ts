import type { Course, Session, Unlock } from '../db/types'
import { minutesToHM } from './dates'
import { streakDays } from './stats'
import type { CourseReadiness } from './readiness'

export interface LeakCost {
  minutes: number
  streak: number
  readinessDelta: number
  courseName: string | null
  examDays: number | null
  balance: number
  lines: { label: string; value: string; tone?: 'cost' | 'keep' }[]
}

export function costOfLeak(input: {
  sessions: Session[]
  unlocks: Unlock[]
  courses: Course[]
  readiness: CourseReadiness[]
  appName: string
  minutes?: number
  sessionRemainingMin?: number
}): LeakCost {
  const minutes = input.minutes ?? 5
  const earned = input.sessions.reduce((s, x) => s + x.minutes, 0)
  const leaked = input.unlocks.reduce((s, x) => s + x.minutes, 0)
  const streak = streakDays(input.sessions)
  const balance = earned - leaked

  const target = input.readiness.find((r) => r.examDays != null) ?? input.readiness[0]
  const top = target?.leverage[0]
  const readinessDelta = top
    ? Math.min(top.gain, Math.round(top.gain * Math.min(1, minutes / top.minutes)))
    : Math.round(minutes / 12)

  const courseName = target?.course.name ?? null
  const examDays = target?.examDays ?? null

  const lines: LeakCost['lines'] = [
    { label: `Scroll on ${input.appName}`, value: `${minutes} min`, tone: 'cost' },
    {
      label: 'Focus block',
      value: input.sessionRemainingMin
        ? `${input.sessionRemainingMin} min left`
        : 'next 25 min',
      tone: 'cost',
    },
  ]
  if (top) {
    lines.push({
      label: `${courseName ?? 'Readiness'} today`,
      value: `−${readinessDelta}%`,
      tone: 'cost',
    })
  }
  if (streak > 0) lines.push({ label: 'Streak at risk', value: `${streak} days`, tone: 'cost' })
  lines.push({ label: 'Attention balance', value: `${balance >= 0 ? '+' : ''}${balance} min`, tone: balance >= 0 ? 'keep' : 'cost' })

  return {
    minutes,
    streak,
    readinessDelta,
    courseName,
    examDays,
    balance,
    lines,
  }
}

export function costHeadline(cost: LeakCost): string {
  if (cost.examDays != null && cost.readinessDelta > 0) {
    return `Opening this costs ${cost.minutes} minutes and about ${cost.readinessDelta}% readiness before your exam in ${cost.examDays} days.`
  }
  return `Opening this costs ${cost.minutes} minutes you said you'd spend studying.`
}

export function formatBalance(minutes: number): string {
  return `${minutes >= 0 ? '+' : '−'}${minutesToHM(Math.abs(minutes))}`
}
