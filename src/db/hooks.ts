import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type {
  Assessment,
  Commitment,
  Course,
  Recall,
  Reminder,
  SavedPlan,
  Session,
  Task,
  Topic,
  Unlock,
} from './types'

const notDeleted = <T extends { deletedAt: number | null }>(rows: T[] | undefined): T[] =>
  (rows ?? []).filter((r) => r.deletedAt == null)

export function useCourses(): Course[] {
  return notDeleted(useLiveQuery(() => db.courses.toArray(), []))
}

export function useAssessments(): Assessment[] {
  return notDeleted(useLiveQuery(() => db.assessments.toArray(), []))
}

export function useTasks(): Task[] {
  return notDeleted(useLiveQuery(() => db.tasks.toArray(), []))
}

export function useTopics(): Topic[] {
  return notDeleted(useLiveQuery(() => db.topics.toArray(), []))
}

export function useSessions(): Session[] {
  return notDeleted(useLiveQuery(() => db.sessions.toArray(), []))
}

/** Bounded session query for screens that only need recent history. */
export function useRecentSessions(days = 120): Session[] {
  return notDeleted(
    useLiveQuery(
      () => db.sessions.where('startedAt').above(Date.now() - days * 86_400_000).toArray(),
      [days],
    ),
  )
}

export function usePlans(): SavedPlan[] {
  return notDeleted(useLiveQuery(() => db.plans.toArray(), []))
}

export function useUnlocks(): Unlock[] {
  return notDeleted(useLiveQuery(() => db.unlocks.toArray(), []))
}

export function useReminders(): Reminder[] {
  return notDeleted(useLiveQuery(() => db.reminders.toArray(), []))
}

export function useRecalls(): Recall[] {
  return notDeleted(useLiveQuery(() => db.recalls.toArray(), []))
}

export function useCommitments(): Commitment[] {
  return notDeleted(useLiveQuery(() => db.commitments.toArray(), []))
}

export function useSetting(key: string, fallback: string): string {
  const value = useLiveQuery(
    () => db.settings.filter((s) => s.key === key && s.deletedAt == null).toArray(),
    [key],
  )
  return value?.[0]?.value ?? fallback
}
