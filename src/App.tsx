import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { applyAppearance, useUI } from './app/theme'
import { EditorialShell } from './app/Shell'
import { setPairing, startAutoSync, syncNow } from './sync/engine'
import { useTimer } from './features/focus/timer'
import { BlockScreen } from './features/block/BlockScreen'

const Instrument = lazy(() => import('./features/instrument/Instrument').then((m) => ({ default: m.Instrument })))
const Today = lazy(() => import('./features/today/Today').then((m) => ({ default: m.Today })))
const Plan = lazy(() => import('./features/plan/Plan').then((m) => ({ default: m.Plan })))
const Review = lazy(() => import('./features/review/Review').then((m) => ({ default: m.Review })))
const Progress = lazy(() => import('./features/progress/Progress').then((m) => ({ default: m.Progress })))
const FocusStudio = lazy(() => import('./features/focus/Studio').then((m) => ({ default: m.FocusStudio })))
const Settings = lazy(() => import('./features/settings/Settings').then((m) => ({ default: m.Settings })))
import { checkReminders } from './features/reminders/engine'
import { setHapticsEnabled, setSoundEnabled } from './features/instrument/feedback'
import { seedDemo } from './lib/demo'
import { db } from './db/db'
import { stamp, uid } from './db/types'
import { fromLocalInput } from './lib/dates'
import { Modal } from './app/ui'

function Loading() {
  return (
    <div className="loading-screen" role="status" aria-label="Loading">
      <span className="display display-sm">meridian</span>
      <span className="label">calibrating the instrument…</span>
    </div>
  )
}

function Onboarding() {
  const setOnboarded = useUI((s) => s.setOnboarded)
  const [name, setName] = useState('')
  const [exam, setExam] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    const courseId = uid()
    await db.courses.add(stamp({
      id: courseId, name: name.trim(), code: '', credits: 3,
      color: '#9a5f3c', teacher: '', semester: '', createdAt: Date.now(),
    }))
    if (exam) {
      await db.assessments.add(stamp({
        id: uid(), courseId, title: 'Final exam', kind: 'exam', weight: 40,
        dueAt: fromLocalInput(exam), score: null, maxScore: 100, note: '',
      }))
    }
    setOnboarded(true)
    setBusy(false)
  }

  return (
    <div className="modal-backdrop instrument-modal" style={{ zIndex: 70 }}>
      <div className="modal-card max-w-[520px]">
        <div className="px-7 pb-8 pt-8">
          <div className="label" style={{ color: 'var(--accent)' }}>First run</div>
          <h2 className="display display-md mt-3">Start with one course.</h2>
          <p className="muted mt-4 text-[13px]">Everything else can wait. A course and an exam date are enough to make the week visible.</p>
          <div className="mt-8 flex flex-col gap-4">
            <div className="field"><label>What are you studying?</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Organic Chemistry" /></div>
            <div className="field"><label>First exam (optional)</label><input className="input" type="datetime-local" value={exam} onChange={(e) => setExam(e.target.value)} /></div>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => void save()} disabled={!name.trim() || busy}>Create my course</button>
            <button className="btn" onClick={() => { setOnboarded(true); void seedDemo() }}>Use sample data</button>
            <button className="btn btn-quiet" onClick={() => setOnboarded(true)}>Skip</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Shell() {
  const ui = useUI()
  const setOnboarded = useUI((s) => s.setOnboarded)
  const location = useLocation()
  const tick = useTimer((s) => s.tick)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => applyAppearance(ui), [ui.theme, ui.accent, ui.glass, ui.density, ui.motion])
  useEffect(() => setSoundEnabled(ui.sound), [ui.sound])
  useEffect(() => setHapticsEnabled(ui.haptics), [ui.haptics])
  useEffect(() => {
    useTimer.getState().reconcile()
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [tick])
  useEffect(() => startAutoSync(), [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('demo')) {
      void seedDemo().then(() => setOnboarded(true))
      setShowOnboarding(false)
    } else {
      setShowOnboarding(!ui.onboarded)
    }
  }, [ui.onboarded])
  useEffect(() => {
    void checkReminders()
    const id = window.setInterval(() => void checkReminders(), 60_000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('pair')
    if (!token) return
    void (async () => {
      await setPairing({ url: window.location.origin, token })
      window.history.replaceState({}, '', window.location.pathname)
      await syncNow()
    })()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUI.getState().setPaletteOpen(!useUI.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Full-screen surfaces own their chrome; query links keep these paths reachable.
  if (location.pathname.startsWith('/block')) {
    return <div className="min-h-screen"><Suspense fallback={<Loading />}><Routes>{routes}</Routes></Suspense>{showOnboarding && <Onboarding />}</div>
  }

  return (
    <>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<EditorialShell />}>
          <Route path="/" element={<Today />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/review" element={<Review />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/instrument" element={<Instrument />} />
        <Route path="/studio" element={<FocusStudio />} />
        <Route path="/block" element={<BlockScreen />} />
        <Route path="/focus" element={<Navigate to="/studio" replace />} />
        <Route path="/observatory" element={<Navigate to="/" replace />} />
        <Route path="/chart" element={<Navigate to="/progress" replace />} />
        <Route path="/ledger" element={<Navigate to="/review" replace />} />
        <Route path="/almanac" element={<Navigate to="/progress" replace />} />
        <Route path="/reset" element={<Navigate to="/plan?rescue=1" replace />} />
        <Route path="/attention" element={<Navigate to="/progress" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      {showOnboarding && <Onboarding />}
    </>
  )
}

const routes = (
  <>
    <Route path="/block" element={<BlockScreen />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </>
)

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
