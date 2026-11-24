import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './app/icons'
import { applyTheme, THEMES, useUI } from './app/theme'
import { setPairing, startAutoSync, syncNow, useSync } from './sync/engine'
import { displayTime, useTimer } from './features/focus/timer'
import { Instrument } from './features/instrument/Instrument'
import { Today } from './features/today/Today'
import { Plan } from './features/plan/Plan'
import { Progress } from './features/progress/Progress'
import { Focus } from './features/focus/Focus'
import { Settings } from './features/settings/Settings'
import { BlockScreen } from './features/block/BlockScreen'
import { checkReminders } from './features/reminders/engine'
import { seedDemo } from './lib/demo'
import { db } from './db/db'
import { stamp, uid } from './db/types'
import { fromLocalInput } from './lib/dates'
import { Modal } from './app/ui'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'book' },
  { to: '/plan', label: 'Plan', icon: 'calendar' },
  { to: '/focus', label: 'Focus', icon: 'play' },
  { to: '/progress', label: 'Progress', icon: 'target' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true">
        <path d="M11 1v26" stroke="var(--text-3)" strokeWidth="1" />
        <circle cx="11" cy="18" r="3.5" fill="var(--accent)" />
      </svg>
      <div>
        <div className="display text-[22px] leading-none">Meridian</div>
        <div className="label mt-1 leading-none" style={{ fontSize: 10 }}>the line between now and later</div>
      </div>
    </div>
  )
}

function Sidebar() {
  const open = useUI((s) => s.sidebarOpen)
  const setOpen = useUI((s) => s.setSidebarOpen)
  const sync = useSync()
  return (
    <>
      {open && <div className="fixed inset-0 z-30" style={{ background: 'rgba(10,9,8,.55)' }} onClick={() => setOpen(false)} />}
      <aside
        className="fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r p-6 transition-transform duration-200 lg:translate-x-0"
        style={{ background: 'var(--bg)', borderColor: 'var(--line)', transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button className="btn btn-quiet btn-icon lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close" size={16} /></button>
        </div>
        <nav className="mt-12 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className="nav-link"
            >
              {({ isActive }) => (
                <NavContent item={item} active={isActive} />
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border p-4" style={{ borderColor: 'var(--line)' }}>
          <div className="label">LAN sync</div>
          <div className="data-sm mt-2" style={{ color: sync.status === 'synced' ? 'var(--positive)' : 'var(--text-2)' }}>{sync.message}</div>
        </div>
      </aside>
    </>
  )
}

function NavContent({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  return (
    <>
      <Icon name={item.icon} size={17} />
      {item.label}
      {active && <span className="ml-auto h-[5px] w-[5px]" style={{ background: 'var(--accent)' }} />}
    </>
  )
}

function TopBar() {
  const setOpen = useUI((s) => s.setSidebarOpen)
  const sync = useSync()
  const timer = useTimer()
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="sticky top-0 z-20 flex items-center gap-4 border-b px-5 py-3 sm:px-8" style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}>
      <button className="btn btn-quiet btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={19} /></button>
      <span className="data-sm dim">{today.toUpperCase()}</span>
      <div className="ml-auto flex items-center gap-2">
        {timer.running && (
          <button
            className="data-sm flex items-center gap-2 border px-3 py-2"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            onClick={() => { window.location.href = '/focus' }}
            title="Active focus block"
          >
            <span className="inline-block h-[5px] w-[5px]" style={{ background: 'var(--accent)' }} />
            {displayTime(timer)}
          </button>
        )}
        <button
          className="btn btn-quiet btn-icon"
          onClick={() => setTheme(THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id)}
          aria-label="Change appearance"
          title={`Theme: ${theme}`}
        >
          <Icon name={theme === 'paper' ? 'sun' : theme === 'ink' ? 'moon' : 'spark'} size={17} />
        </button>
        <div className="data-sm hidden border px-3 py-2 sm:block" style={{ borderColor: 'var(--line)', color: sync.status === 'synced' ? 'var(--positive)' : 'var(--text-3)' }} title={sync.message}>
          {sync.status === 'synced' ? 'SYNCED' : sync.status === 'error' ? 'ERROR' : sync.status === 'syncing' ? 'SYNCING' : 'OFFLINE'}
        </div>
      </div>
    </div>
  )
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}>
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className="tab-item">
          {({ isActive }) => (
            <>
              <Icon name={item.icon} size={20} strokeWidth={1.8} />
              {item.label}
              <span className="sr-only" data-active={isActive} />
            </>
          )}
        </NavLink>
      ))}
    </nav>
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
  const theme = useUI((s) => s.theme)
  const onboarded = useUI((s) => s.onboarded)
  const tick = useTimer((s) => s.tick)
  const location = useLocation()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const bare = ['/', '/plan', '/progress', '/settings', '/focus', '/block'].includes(location.pathname)

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [tick])
  useEffect(() => startAutoSync(), [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('demo')) void seedDemo()
    setShowOnboarding(!params.has('demo') && !onboarded)
  }, [onboarded])
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

  const routes = (
    <Routes>
      <Route path="/" element={<Instrument />} />
      <Route path="/plan" element={<Plan />} />
      <Route path="/focus" element={<Navigate to="/" replace />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/block" element={<BlockScreen />} />
      <Route path="/observatory" element={<Navigate to="/" replace />} />
      <Route path="/chart" element={<Navigate to="/plan" replace />} />
      <Route path="/ledger" element={<Navigate to="/plan" replace />} />
      <Route path="/almanac" element={<Navigate to="/progress" replace />} />
      <Route path="/reset" element={<Navigate to="/plan" replace />} />
      <Route path="/attention" element={<Navigate to="/progress" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )

  if (bare) {
    return (
      <div className="min-h-screen">
        {routes}
        {showOnboarding && <Onboarding />}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-[250px]">
        <TopBar />
        <main className="mx-auto w-full max-w-[1240px] px-5 pb-28 pt-8 sm:px-8 lg:pb-16">
          {routes}
        </main>
      </div>
      <MobileNav />
      {showOnboarding && <Onboarding />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
