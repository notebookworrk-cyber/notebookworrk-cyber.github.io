import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { CourseDot, EmptyState, Modal, PageHeader, SectionLabel, Segmented } from '../../app/ui'
import { useAssessments, useCourses, useRecalls, useTopics } from '../../db/hooks'
import { db } from '../../db/db'
import { stamp, touch, uid, type RecallMethod, type RecallRating, type Topic } from '../../db/types'
import { fmtDate } from '../../lib/dates'
import { recallStats } from '../../lib/stats'
import {
  buildReviewQueue,
  METHODS,
  RATINGS,
  REVIEW_STEPS,
  ratingDef,
  recallUpdate,
  type ReviewStatus,
} from '../../lib/recall'

type Filter = 'all' | 'due' | 'weak'

export function Review() {
  const topics = useTopics()
  const recalls = useRecalls()
  const assessments = useAssessments()
  const courses = useCourses()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState<Topic | null>(null)
  const [step, setStep] = useState<'method' | 'answer' | 'done'>('method')
  const [method, setMethod] = useState<RecallMethod>('explain')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ rating: RecallRating; next: string; interval: number } | null>(null)

  const queue = useMemo(
    () => buildReviewQueue({ topics, recalls, assessments, courses }),
    [topics, recalls, assessments, courses],
  )
  const stats = useMemo(() => recallStats(recalls), [recalls])

  useEffect(() => {
    const id = params.get('topic')
    if (!id) return
    const topic = topics.find((t) => t.id === id)
    if (topic) open(topic)
    setParams({}, { replace: true })
    // Opening from a link is a one-shot intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, topics.length])

  function open(topic: Topic) {
    setActive(topic)
    setStep('method')
    setAnswer('')
    setResult(null)
    setMethod('explain')
  }

  async function rate(rating: RecallRating) {
    if (!active) return
    const update = recallUpdate(active, rating)
    await db.topics.put(touch({ ...active, ...update }))
    await db.recalls.add(
      stamp({
        id: uid(),
        topicId: active.id,
        courseId: active.courseId,
        at: Date.now(),
        rating,
        method,
        answer,
        confidenceAfter: update.confidence,
        nextDueAt: update.nextDueAt,
        intervalDays: update.intervalDays,
      }),
    )
    setResult({
      rating,
      next: new Date(update.nextDueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      interval: update.intervalDays,
    })
    setStep('done')
  }

  const visible = queue.filter((item) => {
    if (filter === 'due') return item.status === 'due' || item.status === 'overdue'
    if (filter === 'weak') return item.status === 'weak' || item.status === 'new'
    return true
  })

  const statusLabel: Record<ReviewStatus, string> = {
    overdue: 'overdue',
    due: 'due today',
    upcoming: 'upcoming',
    weak: 'weak',
    new: 'first recall',
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Review · the learning engine"
        title="What do you actually remember?"
        subtitle="Focus time is only half the record. Recall turns a chapter you covered into something you can use. Every interval below comes from attempts you recorded here."
        actions={<Segmented value={filter} options={[{ value: 'all', label: 'All' }, { value: 'due', label: 'Due' }, { value: 'weak', label: 'Weak' }]} onChange={setFilter} />}
      />

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <SectionLabel right={<span className="data-sm dim">{queue.length} chapters</span>}>Revision queue</SectionLabel>
          {visible.length ? (
            <div className="rule-list">
              {visible.map((item) => (
                <div key={item.topic.id} className="rule-row">
                  <CourseDot color={item.course?.color ?? 'var(--text-3)'} size={10} />
                  <div className="row-primary">
                    <div className="row-title truncate">{item.topic.title}</div>
                    <div className="row-sub">
                      {item.course?.name ?? 'Unassigned'} · {item.reason}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`review-status is-${item.status}`}>{statusLabel[item.status]}</span>
                    <div className="data-sm dim mt-1">confidence {item.topic.confidence}/5</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => open(item.topic)}>Recall</button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="ledger"
              title="The queue is clear."
              hint="Add chapters with low confidence in Plan, or switch the filter to see weak topics."
            />
          )}
        </section>

        <aside className="flex flex-col gap-12">
          <section>
            <SectionLabel>Your recall record</SectionLabel>
            <div className="ledger-grid">
              <div><div className="display display-md">{stats.attempts}</div><div className="label mt-1">attempts</div></div>
              <div><div className="display display-md">{stats.successRate == null ? '—' : `${stats.successRate}%`}</div><div className="label mt-1">remembered</div></div>
              <div><div className="display display-md">{stats.hard + stats.lost}</div><div className="label mt-1">difficult</div></div>
              <div><div className="display display-md">{REVIEW_STEPS[REVIEW_STEPS.length - 1]}d</div><div className="label mt-1">longest gap</div></div>
            </div>
          </section>

          <section>
            <SectionLabel>How intervals move</SectionLabel>
            <div className="callout">
              <div className="flex flex-wrap gap-2">
                {REVIEW_STEPS.map((d, i) => <span key={d} className="chip">{i + 1}. {d}d</span>)}
              </div>
              <p className="muted mt-5 text-[13px] leading-relaxed">
                Easy moves one step out. Effort holds the step. Hard moves one step back. Lost returns to one day.
                These are starting intervals, not a promise about memory.
              </p>
            </div>
          </section>

          <section>
            <SectionLabel>Recent attempts</SectionLabel>
            <div className="rule-list">
              {[...recalls].sort((a, b) => b.at - a.at).slice(0, 8).map((r) => (
                <div key={r.id} className="rule-row" style={{ padding: '10px 0' }}>
                  <span className="data-sm" style={{ color: r.rating >= 2 ? 'var(--positive)' : 'var(--accent)' }}>{ratingDef(r.rating).short}</span>
                  <div className="row-primary">
                    <div className="row-title truncate text-[13px]">{topics.find((t) => t.id === r.topicId)?.title ?? 'Chapter'}</div>
                    <div className="row-sub">{r.method} · {fmtDate(r.at)} · next {fmtDate(r.nextDueAt)}</div>
                  </div>
                </div>
              ))}
              {!recalls.length && <p className="muted py-6 text-[13px]">No attempts yet.</p>}
            </div>
          </section>
        </aside>
      </div>

      <Modal open={active != null} onClose={() => setActive(null)} title="Recall loop" wide>
        {active && (
          <div>
            <div className="flex items-center gap-2">
              <CourseDot color={courses.find((c) => c.id === active.courseId)?.color ?? 'var(--text-3)'} />
              <span className="label">{courses.find((c) => c.id === active.courseId)?.name ?? 'Unassigned'} · {active.title}</span>
            </div>

            {step === 'method' && (
              <div className="mt-8 flex flex-col gap-3">
                <p className="muted text-[13px]">Choose how you want to test yourself. Nothing is uploaded or generated.</p>
                {METHODS.map((m) => (
                  <button key={m.id} className="choice-row" onClick={() => { setMethod(m.id); setStep('answer') }}>
                    <span className="choice-mark">{method === m.id ? '▸' : '·'}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-[14px] font-medium">{m.label}</span>
                      <span className="block text-[12px] muted mt-1">{m.hint}</span>
                    </span>
                    <Icon name="chevron" size={15} className="dim" />
                  </button>
                ))}
              </div>
            )}

            {step === 'answer' && (
              <div className="mt-8">
                <div className="callout">
                  <div className="label">The prompt</div>
                  <p className="display display-sm mt-3">Close everything and explain <em>{active.title}</em> from memory.</p>
                  <p className="muted mt-4 text-[13px]">Write only what you can produce without looking. Leave it blank if you chose to rate confidence only.</p>
                </div>
                <div className="field mt-6">
                  <label>Your recall (private, stays on this device)</label>
                  <textarea className="textarea min-h-[140px]" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Key ideas, steps, anything you could not retrieve…" />
                </div>
                <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
                  <button className="btn btn-quiet" onClick={() => setStep('method')}>← Back</button>
                  <button className="btn btn-primary" onClick={() => setStep('done')} disabled={!answer.trim() && method !== 'confidence'}>
                    I have a rating
                  </button>
                </div>
              </div>
            )}

            {step === 'done' && !result && (
              <div className="mt-8">
                <div className="label mb-5">How did that feel?</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {RATINGS.map((r) => (
                    <button key={r.id} className="rating-card" onClick={() => void rate(r.id)}>
                      <span className="rating-value">{r.short}</span>
                      <span className="block text-[12px] muted mt-2">{r.note}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {result && (
              <div className="mt-8 text-center">
                <div className="display display-md" style={{ color: 'var(--positive)' }}>{result.interval} days</div>
                <p className="muted mt-3 text-[13px]">
                  Logged as <strong>{ratingDef(result.rating).short.toLowerCase()}</strong>. Next review {result.next}.
                </p>
                <button className="btn btn-primary mt-7" onClick={() => setActive(null)}>Done</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
