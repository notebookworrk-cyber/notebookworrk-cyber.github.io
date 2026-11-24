import { stamp, type Assessment, type Commitment, type Course, type Recall, type Session, type Topic } from '../src/db/types'

export const now = new Date('2026-11-24T09:00:00').getTime()

export const course = (overrides: Partial<Course> = {}): Course => stamp({
  id: 'c1', name: 'Organic Chemistry', code: 'CHEM 201', credits: 3,
  color: '#9a5f3c', teacher: '', semester: '', createdAt: now, ...overrides,
})

export const topic = (overrides: Partial<Topic> = {}): Topic => stamp({
  id: 't1', courseId: 'c1', title: 'Aromatic compounds', confidence: 2,
  done: 0, estimateMin: 30, ...overrides,
})

export const assessment = (overrides: Partial<Assessment> = {}): Assessment => stamp({
  id: 'a1', courseId: 'c1', title: 'Final exam', kind: 'exam', weight: 40,
  dueAt: now + 7 * 86_400_000, score: null, maxScore: 100, note: '', ...overrides,
})

export const session = (overrides: Partial<Session> = {}): Session => stamp({
  id: 's1', courseId: 'c1', topicId: 't1', mode: 'focus',
  startedAt: now - 86_400_000, endedAt: now - 86_400_000 + 25 * 60_000,
  minutes: 25, plannedMin: 25, note: '', ...overrides,
})

export const recall = (overrides: Partial<Recall> = {}): Recall => stamp({
  id: 'r1', topicId: 't1', courseId: 'c1', at: now - 2 * 86_400_000,
  rating: 2, method: 'explain', answer: '', confidenceAfter: 3,
  nextDueAt: now - 86_400_000, intervalDays: 1, ...overrides,
})

export const commitment = (overrides: Partial<Commitment> = {}): Commitment => stamp({
  id: 'k1', title: 'College', kind: 'class', days: [0, 1, 2, 3, 4, 5, 6],
  startMin: 9 * 60, endMin: 11 * 60, note: '', ...overrides,
})
