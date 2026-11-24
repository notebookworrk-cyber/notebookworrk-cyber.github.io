import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../app/icons'
import { useAssessments, useCourses, useSessions, useTopics, useUnlocks } from '../../db/hooks'
import { db } from '../../db/db'
import { stamp, uid } from '../../db/types'
import { computeReadiness } from '../../lib/readiness'
import { costHeadline, costOfLeak, formatBalance } from '../../lib/cost'
import { displayTime, useTickingTimer, useTimer } from '../focus/timer'

const APPS: Record<string, { name: string; intent: string }> = {
  instagram: { name: 'Instagram', intent: 'intent://instagram.com/#Intent;package=com.instagram.android;scheme=https;end' },
  youtube: { name: 'YouTube', intent: 'intent://www.youtube.com/#Intent;package=com.google.android.youtube;scheme=https;end' },
  shorts: { name: 'YouTube Shorts', intent: 'intent://www.youtube.com/shorts#Intent;package=com.google.android.youtube;scheme=https;end' },
  tiktok: { name: 'TikTok', intent: 'intent://www.tiktok.com/#Intent;package=com.zhiliaoapp.musically;scheme=https;end' },
  snapchat: { name: 'Snapchat', intent: 'intent://snapchat.com/#Intent;package=com.snapchat.android;scheme=https;end' },
  reddit: { name: 'Reddit', intent: 'intent://www.reddit.com/#Intent;package=com.reddit.frontpage;scheme=https;end' },
  twitter: { name: 'X', intent: 'intent://x.com/#Intent;package=com.twitter.android;scheme=https;end' },
}

const HOLD_MS = 3000

export function BlockScreen() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const appKey = params.get('app') ?? 'instagram'
  const app = APPS[appKey] ?? { name: appKey, intent: '' }

  const courses = useCourses()
  const topics = useTopics()
  const assessments = useAssessments()
  const sessions = useSessions()
  const unlocks = useUnlocks()
  const timer = useTickingTimer()

  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const raf = useRef<number | null>(null)
  const started = useRef(0)

  const readiness = useMemo(
    () => computeReadiness({ courses, topics, assessments, sessions }),
    [courses, topics, assessments, sessions],
  )
  const cost = useMemo(
    () => costOfLeak({
      sessions, unlocks, courses, readiness, appName: app.name,
      sessionRemainingMin: timer.running
        ? Math.max(1, Math.ceil((timer.durationMin * 60_000 - (timer.startedAt != null ? Date.now() - timer.startedAt + timer.accumulatedMs : timer.accumulatedMs)) / 60_000))
        : undefined,
    }),
    [sessions, unlocks, courses, readiness, app.name, timer.running, timer.durationMin, timer.startedAt, timer.accumulatedMs],
  )

  function startHold() {
    if (holding) return
    setHolding(true)
    started.current = performance.now()
    const step = () => {
      const p = Math.min(1, (performance.now() - started.current) / HOLD_MS)
      setProgress(p)
      if (p < 1) raf.current = requestAnimationFrame(step)
      else void unlock()
    }
    raf.current = requestAnimationFrame(step)
  }

  function stopHold() {
    if (raf.current != null) cancelAnimationFrame(raf.current)
    raf.current = null
    setHolding(false)
    setProgress(0)
  }

  async function unlock() {
    await db.unlocks.add(stamp({
      id: uid(), app: appKey, at: Date.now(), minutes: cost.minutes,
      context: `block screen · ${cost.readinessDelta}% readiness`,
    }))
    setNotice(`Logged. That's ${cost.minutes} minutes. Balance ${formatBalance(cost.balance - cost.minutes)}.`)
    stopHold()
    window.setTimeout(() => {
      if (app.intent) window.location.href = app.intent
      else navigate('/')
    }, 1200)
  }

  return (
    <div className="surface-ink fixed inset-0 z-[60] flex flex-col overflow-y-auto" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-6 py-10 sm:py-16">
        <header className="flex items-center justify-between">
          <div className="data-sm" style={{ color: 'var(--accent)' }}>MERIDIAN / FOCUS SHIELD</div>
          <button className="btn btn-quiet btn-sm" onClick={() => navigate('/')}><Icon name="close" size={14} /> Dismiss</button>
        </header>

        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="label" style={{ color: 'var(--text-3)' }}>You opened</div>
          <h1 className="display display-xl mt-3" style={{ fontSize: 'clamp(72px, 13vw, 140px)' }}>{app.name}</h1>

          <div className="mt-10 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
            <div className="label mb-6" style={{ color: 'var(--accent)' }}>The cost</div>
            <p className="display display-md max-w-[640px] leading-[1.08]">{costHeadline(cost)}</p>

            <div className="mt-10 max-w-[560px]">
              {cost.lines.map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-6 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <span className="text-[13px]" style={{ color: 'var(--text-2)' }}>{line.label}</span>
                  <span className="data" style={{ color: line.tone === 'keep' ? 'var(--positive)' : 'var(--accent)' }}>{line.value}</span>
                </div>
              ))}
            </div>
          </div>

          {timer.running && (
            <div className="mt-10 max-w-[400px]">
              <div className="label mb-3">Your focus block is still running</div>
              <div className="data" style={{ color: 'var(--accent)' }}>{displayTime(timer)} remaining</div>
              <div className="mt-3 h-px w-full" style={{ background: 'var(--line)' }}>
                <div className="h-px" style={{ width: `${Math.min(100, (timer.accumulatedMs / (timer.durationMin * 60_000)) * 100)}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button className="btn btn-primary px-9 py-4" style={{ minHeight: 56 }} onClick={() => navigate('/focus')}>
              <Icon name="arrow" size={15} /> Back to focus
            </button>
            <button
              className="btn px-8 py-4"
              style={{ minHeight: 56, borderColor: holding ? 'var(--accent)' : 'var(--line)', minWidth: 240 }}
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              disabled={notice != null}
            >
              <span className="relative z-10">{holding ? `Keep holding… ${Math.round((1 - progress) * 3)}s` : 'Hold 3s to open anyway'}</span>
              {holding && (
                <span className="absolute bottom-0 left-0 h-[2px]" style={{ width: `${progress * 100}%`, background: 'var(--accent)' }} />
              )}
            </button>
          </div>

          {notice && <p className="mt-6 text-[13px]" style={{ color: 'var(--accent)' }}>{notice}</p>}
          <p className="mt-10 max-w-md text-[12px]" style={{ color: 'var(--text-3)' }}>
            The scroll will still be there. This exam won't.
          </p>
        </div>
      </div>
    </div>
  )
}
