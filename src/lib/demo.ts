import { db, getMeta, setMeta } from '../db/db'
import { stamp, uid, type Assessment, type Course, type Session, type Task, type Topic } from '../db/types'

const COURSES: Array<Pick<Course, 'name' | 'code' | 'color' | 'credits'>> = [
  { name: 'Organic Chemistry', code: 'CHEM 230', color: '#9a5f3c', credits: 4 },
  { name: 'Linear Algebra', code: 'MATH 214', color: '#4f6b4a', credits: 3 },
  { name: 'Modern History', code: 'HIST 180', color: '#8a6a2f', credits: 3 },
  { name: 'Systems Design', code: 'CS 260', color: '#3e5c76', credits: 4 },
  { name: 'Japanese II', code: 'JAPN 102', color: '#6b4a5c', credits: 2 },
]

const DAY = 86_400_000
let seeding: Promise<boolean> | null = null

export function seedDemo(): Promise<boolean> {
  if (!seeding) seeding = runSeed().finally(() => { seeding = null })
  return seeding
}

async function runSeed(): Promise<boolean> {
  if (await getMeta('demoSeeded')) return false
  if ((await db.courses.count()) > 0) return false

  const courses: Course[] = COURSES.map((c) =>
    stamp({
      id: uid(),
      name: c.name,
      code: c.code,
      color: c.color,
      credits: c.credits,
      teacher: '',
      semester: 'Current',
      createdAt: Date.now() - 60 * DAY,
    }),
  )

  const topicTitles = [
    ['Reaction mechanisms', 'Stereochemistry', 'Aromaticity', 'Spectroscopy'],
    ['Vector spaces', 'Eigenvalues', 'Linear transformations', 'Orthogonality'],
    ['Industrial revolution', 'Cold war', 'Decolonisation', 'Modern Europe'],
    ['Distributed systems', 'Caching', 'Consensus', 'Observability'],
    ['Kanji review', 'Listening', 'Grammar drills', 'Conversation'],
  ]

  for (const c of courses) await db.courses.add(c)

  for (const [i, course] of courses.entries()) {
    for (const [j, title] of topicTitles[i].entries()) {
      const topic: Topic = stamp({
        id: uid(),
        courseId: course.id,
        title,
        confidence: [3, 4, 5, 2][j],
        done: j < 2 ? 1 : 0,
      })
      await db.topics.add(topic)
    }
  }

  const taskTitles = [
    ['Finish chapter 7 problem set', 'Review aldol reactions', 'Lab report draft'],
    ['Problem set 4', 'Quiz prep: eigenvectors', 'Proof walkthrough'],
    ['Read chapter 12', 'Essay outline', 'Source annotations'],
    ['Build sync prototype', 'Design review notes', 'Fix cache invalidation'],
    ['Anki deck 40 cards', 'Listening exercise', 'Write 200 characters'],
  ]
  const tasks: Task[] = []
  courses.forEach((course, i) => {
    taskTitles[i].forEach((title, j) => {
      tasks.push(
        stamp({
          id: uid(),
          title,
          courseId: j === 2 ? null : course.id,
          dueAt: Date.now() + (j === 0 ? 0.3 : j === 1 ? 2 : 6) * DAY + i * 1_800_000,
          priority: j === 0 ? 1 : 2,
          estimateMin: [50, 30, 90][j],
          done: 0,
          note: '',
        }),
      )
    })
  })
  for (const t of tasks) await db.tasks.add(t)

  const examTitles = ['Midterm exam', 'Final exam', 'Quiz', 'Project submission']
  courses.forEach((course, i) => {
    examTitles.slice(0, i < 3 ? 2 : 1).forEach((title, j) => {
      const a: Assessment = stamp({
        id: uid(),
        courseId: course.id,
        title,
        kind: j === 0 ? 'exam' : 'assignment',
        weight: j === 0 ? 35 : 15,
        dueAt: Date.now() + (4 + i * 3 + j * 9) * DAY,
        score: null,
        maxScore: 100,
        note: '',
      })
      void db.assessments.add(a)
    })
  })

  for (let d = 12; d >= 0; d--) {
    if (d === 5 || d === 9) continue
    const day = new Date()
    day.setDate(day.getDate() - d)
    const count = d % 3 === 0 ? 2 : 1
    for (let k = 0; k < count; k++) {
      const course = courses[(d + k) % courses.length]
      const session: Session = stamp({
        id: uid(),
        courseId: course.id,
        mode: 'focus',
        startedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9 + k * 3, 0).getTime(),
        endedAt: 0,
        minutes: 45 + ((d * 7 + k * 13) % 50),
        note: '',
      })
      await db.sessions.add(session)
    }
  }

  await setMeta('demoSeeded', '1')
  return true
}
