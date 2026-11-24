import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { CourseDot, PageHeader, SectionLabel, Segmented } from '../../app/ui'
import { useAssessments, useCommitments, useCourses, useRecalls, useSessions, useSetting, useTasks, useTopics, useUnlocks } from '../../db/hooks'
import { dayKey, minutesToHM } from '../../lib/dates'
import {
  completionRate,
  consistency,
  heatLevel,
  monthlyTotal,
  recallStats,
  sessionsByDay,
  streakDays,
  subjectBalance,
  subjectDistribution,
  weeklyTotal,
} from '../../lib/stats'
import { computeReadiness } from '../../lib/readiness'
import { computeDeficit } from '../../lib/deficit'
import { estimateAccuracy } from '../../lib/estimate'
import { formatBalance } from '../../lib/cost'
import { download } from '../../lib/download'
import { useTimer } from '../focus/timer'

function letter(pct: number): string {
  if (pct >= 93) return 'A'
  if (pct >= 90) return 'A−'
  if (pct >= 87) return 'B+'
  if (pct >= 83) return 'B'
  if (pct >= 80) return 'B−'
  if (pct >= 77) return 'C+'
  if (pct >= 73) return 'C'
  if (pct >= 70) return 'C−'
  if (pct >= 67) return 'D+'
  if (pct >= 60) return 'D'
  return 'F'
}

type Tab = 'readiness' | 'patterns' | 'grades' | 'statement'

export function Progress() {
  const courses = useCourses()
  const topics = useTopics()
  const assessments = useAssessments()
  const sessions = useSessions()
  const unlocks = useUnlocks()
  const recalls = useRecalls()
  const tasks = useTasks()
  const startTimer = useTimer((s) => s.start)
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tab, setTab] = useState<Tab>('readiness')
  const [courseId, setCourseId] = useState('')
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const commitments = useCommitments()
  const hoursPerDay = Number(useSetting('resetHours', '2.5')) || 2.5
  const deficit = useMemo(
    () => computeDeficit({ topics, assessments, commitments, hoursPerDay }),
    [topics, assessments, commitments, hoursPerDay],
  )

  const readiness = useMemo(
    () => computeReadiness({ courses, topics, assessments, sessions, recalls }),
    [courses, topics, assessments, sessions, recalls],
  )
  const accuracy = useMemo(() => estimateAccuracy(sessions), [sessions])
  const recall = useMemo(() => recallStats(recalls), [recalls])
  const completion = useMemo(() => completionRate(tasks), [tasks])
  const steady = useMemo(() => consistency(sessions), [sessions])
  const distribution = useMemo(() => subjectDistribution(sessions, courses), [sessions, courses])
  const imbalance = useMemo(() => subjectBalance(sessions, courses), [sessions, courses])

  const focusSessions = sessions.filter((s) => s.mode !== 'break')
  const earned = focusSessions.reduce((s, x) => s + x.minutes, 0)
  const leaked = unlocks.reduce((s, x) => s + x.minutes, 0)
  const balance = earned - leaked
  const leakRate = earned + leaked ? Math.round((leaked / (earned + leaked)) * 100) : 0
  const streak = streakDays(sessions)
  const byDay = sessionsByDay(sessions)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = dayKey(d)
    return { key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), minutes: byDay.get(key) ?? 0 }
  })
  const maxDay = Math.max(60, ...days.map((d) => d.minutes))
  const heat = Array.from({ length: 28 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (27 - i))
    return { key: dayKey(d), minutes: byDay.get(dayKey(d)) ?? 0 }
  })

  const selected = courses.find((c) => c.id === courseId) ?? courses[0] ?? null
  const courseAssessments = assessments.filter((a) => a.courseId === selected?.id)
  const graded = courseAssessments.filter((a) => a.score != null && a.weight > 0 && a.maxScore > 0)
  const gradedWeight = graded.reduce((s, a) => s + a.weight, 0)
  const current = gradedWeight
    ? graded.reduce((s, a) => s + (a.score! / a.maxScore) * a.weight, 0) / gradedWeight
    : 0
  const remaining = courseAssessments.filter((a) => a.score == null && a.weight > 0)
  const remainingWeight = remaining.reduce((s, a) => s + a.weight, 0)
  const projected = gradedWeight + remainingWeight
    ? (graded.reduce((s, a) => s + (a.score! / a.maxScore) * a.weight, 0)
        + remaining.reduce((s, a) => s + (expected[a.id] ?? 80) / 100 * a.weight, 0)) / (gradedWeight + remainingWeight)
    : current

  function startLeverage(courseId: string, minutes: number) {
    startTimer('focus', minutes, courseId)
    navigate('/instrument?start=1')
  }

  function renderStatement(): string {
    const canvas = canvasRef.current!
    const c = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    c.fillStyle = '#f5f2ea'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#171614'
    c.fillRect(0, 0, W, 10)

    c.textAlign = 'left'
    c.fillStyle = '#d6401f'
    c.font = '600 30px ui-monospace, monospace'
    c.fillText('MERIDIAN  /  STATEMENT', 90, 120)
    c.fillStyle = '#6e6a61'
    c.font = '400 28px ui-monospace, monospace'
    c.fillText(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase() + '  –  THIS WEEK', 90, 168)

    c.fillStyle = '#171614'
    c.font = '500 104px Newsreader, Georgia, serif'
    c.fillText('What your', 86, 310)
    c.fillText('attention bought.', 86, 420)

    c.strokeStyle = '#dcd6c8'
    c.lineWidth = 2
    c.beginPath(); c.moveTo(90, 500); c.lineTo(W - 90, 500); c.stroke()

    const rows: [string, string, string][] = [
      ['Attention kept', minutesToHM(earned), '#22684a'],
      ['Focus minutes', minutesToHM(weeklyTotal(sessions)), '#171614'],
      ['Consistency', `${steady.percent}% of days`, '#171614'],
      ['Recall attempts', `${recall.attempts}`, '#171614'],
      ['Chapters done', `${topics.filter((t) => t.done === 1).length}/${topics.length}`, '#171614'],
      ['Leaked', minutesToHM(leaked), '#d6401f'],
    ]
    rows.forEach(([label, value, color], i) => {
      const y = 590 + i * 130
      c.fillStyle = '#6e6a61'
      c.font = '400 28px ui-monospace, monospace'
      c.fillText(label.toUpperCase(), 92, y)
      c.textAlign = 'right'
      c.fillStyle = color
      c.font = '500 62px Newsreader, Georgia, serif'
      c.fillText(value, W - 92, y + 8)
      c.textAlign = 'left'
      c.fillStyle = '#e8e3d8'
      c.fillRect(90, y + 38, W - 180, 1)
    })

    const verdict = leakRate < 10 ? 'Quietly unstoppable.' : leakRate < 25 ? 'Mostly locked in.' : 'The scroll got a few. Take them back.'
    c.fillStyle = '#d6401f'
    c.font = '500 58px Newsreader, Georgia, serif'
    c.fillText(verdict, 88, 1440)

    c.fillStyle = '#989287'
    c.font = '400 26px ui-monospace, monospace'
    c.fillText('GENERATED ON YOUR DEVICE · NO NOTES OR RECORDS SHARED', 90, 1830)
    return canvas.toDataURL('image/png')
  }

  async function share() {
    setBusy(true)
    await document.fonts.ready
    const url = renderStatement()
    const blob = await (await fetch(url)).blob()
    const file = new File([blob], 'meridian-statement.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My Meridian statement' })
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = 'meridian-statement.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    setBusy(false)
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Progress · the evidence"
        title="What the record says."
        subtitle="Estimates are shown as estimates, with what they are built on. Nothing here predicts an exam result."
        actions={<Segmented value={tab} options={[{ value: 'readiness', label: 'Readiness' }, { value: 'patterns', label: 'Patterns' }, { value: 'grades', label: 'Grades' }, { value: 'statement', label: 'Statement' }]} onChange={setTab} />}
      />

      {tab === 'readiness' && (
        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="forecast-hero">
              <div className="label">The line · where the time and the evidence meet</div>
              <div className="forecast-number">
                {deficit
                  ? deficit.gapMin > 0
                    ? `${Math.ceil(deficit.gapMin / 60)} hours short`
                    : `${Math.ceil(Math.max(0, -deficit.gapMin) / 60)} hours of slack`
                  : 'No chapters left to place'}
              </div>
              <div className="forecast-range">
                <span className="data-sm dim">Usable</span>
                <div className="forecast-track">
                  <i style={{ width: `${deficit ? Math.min(100, (deficit.usableMin / Math.max(1, deficit.requiredMin)) * 100) : 100}%` }} />
                </div>
                <span className="data-sm dim">Needed</span>
              </div>
              <p className="muted mt-4 text-[13px]">
                {deficit
                  ? `${Math.round(deficit.usableMin / 60)} h available before ${deficit.exam?.title ?? 'the next two weeks'} against ${Math.round(deficit.requiredMin / 60)} h of chapter estimates. Readiness band: ${readiness[0] ? `${readiness[0].low}–${readiness[0].high}% for ${readiness[0].course.name}` : 'not enough evidence yet'}. Estimates, not grades.`
                  : 'Add a chapter in Plan to make the line visible.'}
              </p>
            </div>
            <SectionLabel>Readiness by course · an estimate, not a prediction</SectionLabel>
            <div className="flex flex-col">
              {readiness.map((r) => (
                <div key={r.course.id} className="border-t py-7 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="flex items-center gap-3">
                      <CourseDot color={r.course.color} size={10} />
                      <div>
                        <div className="display display-sm">{r.course.name}</div>
                        <div className="label mt-1">{r.examDays ? `Exam in ${r.examDays} days` : `${r.done}/${r.topics} chapters done`} · {r.confidenceLabel} evidence</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="display display-lg" style={{ color: r.examDays && r.examDays <= 7 ? 'var(--accent)' : undefined }}>{r.low}–{r.high}</div>
                      <div className="label">percent ready</div>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {r.evidence.map((e) => (
                      <div key={e.label} className="flex items-center justify-between gap-3 border-b py-2" style={{ borderColor: 'var(--line-soft)' }}>
                        <span className="label">{e.label}</span>
                        <span className="data-sm" style={{ color: e.state === 'present' ? 'var(--positive)' : 'var(--text-3)' }}>{e.value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="dim mt-4 text-[12px]">
                    Missing: {r.missing.length ? r.missing.join(', ') : 'nothing obvious'}{r.updatedAt ? ` · last change ${new Date(r.updatedAt).toLocaleDateString()}` : ''}
                  </p>
                  {r.leverage.length > 0 && (
                    <div className="mt-7 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
                      <div className="label mb-4">Biggest move for the time</div>
                      <div className="flex flex-col gap-2">
                        {r.leverage.map((l) => (
                          <button key={l.topicId} onClick={() => startLeverage(l.courseId, l.minutes)} className="rule-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                            <span className="data-sm" style={{ color: 'var(--accent)' }}>+{l.gain}%</span>
                            <div className="row-primary"><div className="row-title truncate">{l.title}</div></div>
                            <span className="data-sm dim">{l.minutes} min</span>
                            <Icon name="arrow" size={14} className="dim" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!readiness.length && (
                <div className="border-t pt-8">
                  <div className="display display-sm">Nothing measured yet.</div>
                  <p className="muted mt-3 text-[13px]">Add chapters and an exam date in Plan. Readiness appears here automatically.</p>
                </div>
              )}
            </div>
          </section>
          <aside>
            <SectionLabel>How it works</SectionLabel>
            <div className="callout text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
              <p>Readiness blends what you recorded: chapter completion, confidence, graded work, recent attention and recall attempts.</p>
              <ul className="mt-4 flex flex-col gap-3">
                <li><span style={{ color: 'var(--text)' }}>Chapters</span> — done or still open, and how confident you felt.</li>
                <li><span style={{ color: 'var(--text)' }}>Scores</span> — your graded assessments, weighted by the teacher.</li>
                <li><span style={{ color: 'var(--text)' }}>Pace & recall</span> — attention this week and attempts at remembering.</li>
              </ul>
              <p className="mt-5">The range is deliberately a range. It widens when data is thin.</p>
            </div>
          </aside>
        </div>
      )}

      {tab === 'patterns' && (
        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <SectionLabel>Study patterns</SectionLabel>
            <div className="ledger-grid">
              <div><div className="display display-md">{minutesToHM(weeklyTotal(sessions))}</div><div className="label mt-1">this week</div></div>
              <div><div className="display display-md">{minutesToHM(monthlyTotal(sessions))}</div><div className="label mt-1">this month</div></div>
              <div><div className="display display-md">{steady.percent}%</div><div className="label mt-1">consistent days</div></div>
              <div><div className="display display-md">{streak}</div><div className="label mt-1">day streak</div></div>
            </div>
            <div className="mt-10 flex h-32 items-end gap-3">
              {days.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full" style={{ height: `${Math.max(2, (d.minutes / maxDay) * 100)}%`, background: d.minutes ? 'var(--positive)' : 'var(--line)' }} />
                  </div>
                  <span className="data-sm dim">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-1.5">
              {heat.map((d) => <span key={d.key} className="heat-cell" style={{ background: d.minutes ? heatLevel(d.minutes) === 4 ? 'var(--positive)' : `color-mix(in srgb, var(--positive) ${heatLevel(d.minutes) * 22}%, var(--surface-3))` : 'var(--surface-3)' }} title={`${d.key}: ${d.minutes} min`} />)}
            </div>

            <SectionLabel>Subject distribution</SectionLabel>
            <div className="rule-list">
              {distribution.map((d) => (
                <div key={d.courseId} className="rule-row">
                  <CourseDot color={d.color} />
                  <div className="row-primary"><div className="row-title truncate text-[13px]">{d.name}</div><div className="row-sub">{minutesToHM(d.minutes)}</div></div>
                  <div className="w-24"><div className="progress-track h-[3px]"><div className="progress-fill h-full" style={{ width: `${d.percent}%`, background: d.color }} /></div></div>
                  <span className="data-sm">{d.percent}%</span>
                </div>
              ))}
              {!distribution.length && <p className="muted py-6 text-[13px]">Finish a session to see where your time goes.</p>}
            </div>
            {imbalance && <p className="dim mt-5 text-[12px]">{imbalance.name} has taken {imbalance.percent}% of recent attention. That may be right — worth a glance.</p>}
          </section>

          <aside className="flex flex-col gap-12">
            <section>
              <SectionLabel>Chapter intelligence</SectionLabel>
              <div className="ledger-grid">
                <div><div className="display display-md">{completion.done}/{completion.total}</div><div className="label mt-1">tasks done</div></div>
                <div><div className="display display-md">{topics.filter((t) => t.done === 1).length}/{topics.length}</div><div className="label mt-1">chapters done</div></div>
                <div><div className="display display-md">{recall.attempts}</div><div className="label mt-1">recalls</div></div>
                <div><div className="display display-md">{recall.successRate == null ? '—' : `${recall.successRate}%`}</div><div className="label mt-1">remembered</div></div>
              </div>
            </section>
            <section>
              <SectionLabel>Flight recorder</SectionLabel>
              <div className="callout">
                <div className="display display-sm" style={{ color: accuracy.averageRatio == null ? 'var(--text-3)' : accuracy.averageRatio > 1.15 ? 'var(--accent)' : 'var(--positive)' }}>
                  {accuracy.averageRatio == null ? '—' : `${Math.round(accuracy.averageRatio * 100)}%`}
                </div>
                <div className="label mt-2">actual ÷ planned</div>
                <p className="muted mt-5 text-[12px] leading-relaxed">{accuracy.note}</p>
                <p className="dim mt-3 text-[11px]">From {accuracy.sessions} planned session{accuracy.sessions === 1 ? '' : 's'}. Underestimated {accuracy.underestimated} · overestimated {accuracy.overestimated}.</p>
              </div>
            </section>
            <section>
              <SectionLabel>Recall balance</SectionLabel>
              <div className="rule-list">
                {[['Easy', recall.easy, 'var(--positive)'], ['Effort', recall.effort, 'var(--text-2)'], ['Hard', recall.hard, 'var(--accent)'], ['Lost', recall.lost, 'var(--accent)']].map(([label, value, color]) => (
                  <div key={String(label)} className="rule-row" style={{ padding: '9px 0' }}>
                    <span className="text-[13px]" style={{ color: String(color) }}>{label}</span>
                    <div className="row-primary" />
                    <span className="data-sm">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === 'grades' && (
        <section className="mt-12 max-w-[720px]">
          <SectionLabel right={
            <select className="select w-auto min-w-[180px] py-2" value={selected?.id ?? ''} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          }>Grade what-if</SectionLabel>
          {!selected ? <p className="muted text-[13px]">Add a course first.</p> : (
            <div className="panel p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-8">
                <div>
                  <div className="label">Projected final · hypothetical</div>
                  <div className="display display-xl mt-3">{(projected * 100).toFixed(1)}%</div>
                </div>
                <div className="display display-xl" style={{ color: 'var(--accent)' }}>{letter(projected * 100)}</div>
              </div>
              <div className="mt-8 border-t pt-6" style={{ borderColor: 'var(--line)' }}>
                {remaining.length === 0 && <p className="muted text-[13px]">No ungraded assessments left for this course.</p>}
                {remaining.map((a) => (
                  <div key={a.id} className="py-5" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="flex justify-between gap-4">
                      <div className="text-[14px]">{a.title}</div>
                      <div className="data-sm">{expected[a.id] ?? 80}% · {a.weight}%</div>
                    </div>
                    <input className="mt-4 w-full" type="range" min={0} max={100} value={expected[a.id] ?? 80} onChange={(e) => setExpected({ ...expected, [a.id]: Number(e.target.value) })} />
                  </div>
                ))}
              </div>
              {gradedWeight > 0 && <p className="dim mt-6 text-[12px]">Already graded: {gradedWeight}% of the course, currently {(current * 100).toFixed(1)}%.</p>}
            </div>
          )}
        </section>
      )}

      {tab === 'statement' && (
        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section>
            <SectionLabel>This week in attention</SectionLabel>
            <div className="panel p-6 sm:p-8">
              <div className="label">Balance</div>
              <div className="display display-xl mt-3" style={{ color: balance >= 0 ? 'var(--positive)' : 'var(--accent)' }}>{formatBalance(balance)}</div>
              <div className="mt-8 grid grid-cols-3 gap-4 border-t pt-6" style={{ borderColor: 'var(--line)' }}>
                <div><div className="display display-md" style={{ color: 'var(--positive)' }}>{minutesToHM(earned)}</div><div className="label mt-2">earned</div></div>
                <div><div className="display display-md" style={{ color: 'var(--accent)' }}>{minutesToHM(leaked)}</div><div className="label mt-2">leaked</div></div>
                <div><div className="display display-md">{leakRate}%</div><div className="label mt-2">leak rate</div></div>
              </div>
              <div className="mt-10 flex h-32 items-end gap-3">
                {days.map((d) => (
                  <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div className="w-full" style={{ height: `${Math.max(2, (d.minutes / maxDay) * 100)}%`, background: d.minutes ? 'var(--positive)' : 'var(--line)' }} />
                    </div>
                    <span className="data-sm dim">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside>
            <SectionLabel>Your statement</SectionLabel>
            <div className="panel p-6">
              <div className="aspect-[9/16] w-full overflow-hidden p-6" style={{ background: '#f5f2ea', color: '#171614' }}>
                <div className="data-sm" style={{ color: '#d6401f' }}>MERIDIAN / STATEMENT</div>
                <div className="display display-md mt-8" style={{ fontSize: 34 }}>What your attention bought.</div>
                <div className="mt-8 border-t-2" style={{ borderColor: '#dcd6c8' }}>
                  {[['KEPT', minutesToHM(earned)], ['WEEK', minutesToHM(weeklyTotal(sessions))], ['CONSISTENCY', `${steady.percent}%`], ['RECALL', `${recall.attempts} attempts`], ['BALANCE', formatBalance(balance)]].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-3" style={{ borderBottom: '1px solid #e8e3d8' }}>
                      <span className="data-sm" style={{ color: '#6e6a61' }}>{k}</span>
                      <span className="data-sm">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 text-[13px]" style={{ color: '#d6401f' }}>
                  {leakRate < 10 ? 'Quietly unstoppable.' : leakRate < 25 ? 'Mostly locked in.' : 'The scroll got a few. Take them back.'}
                </div>
              </div>
              <button className="btn btn-primary mt-6 w-full" onClick={() => void share()} disabled={busy}>
                <Icon name="download" size={15} /> {busy ? 'Making…' : 'Save & share card'}
              </button>
              <p className="dim mt-4 text-[11px]">Made on your device. Nothing is uploaded.</p>
            </div>
          </aside>
        </div>
      )}

      <canvas ref={canvasRef} width={1080} height={1920} className="hidden" />
    </div>
  )
}
