import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './icons'
import { THEMES, useUI } from './theme'
import { CommandPalette } from './palette'
import { displayTime, useTimer } from '../features/focus/timer'
import { useSync } from '../sync/engine'

const RAIL: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'sun' },
  { to: '/instrument', label: 'Instrument', icon: 'target' },
  { to: '/plan', label: 'Plan', icon: 'calendar' },
  { to: '/review', label: 'Review', icon: 'ledger' },
  { to: '/notes', label: 'Notes', icon: 'ledger' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function Mark({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg width={small ? 18 : 22} height={small ? 24 : 28} viewBox="0 0 22 28" fill="none" aria-hidden="true">
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

function BinderTabs() {
  return (
    <nav className="binder-tabs" aria-label="Sections">
      {RAIL.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `binder-tab${isActive ? ' active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Feeds the specular highlight on glass surfaces. Skipped in reduced/performance modes. */
function useGlassPointer() {
  useEffect(() => {
    const root = document.documentElement
    if (root.dataset.motion === 'reduced' || root.dataset.glass === 'performance') return
    const onMove = (event: PointerEvent) => {
      const surfaces = document.querySelectorAll<HTMLElement>('[data-glass-surface]')
      for (const el of surfaces) {
        const rect = el.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) continue
        el.style.setProperty('--mx', `${Math.round(event.clientX - rect.left)}px`)
        el.style.setProperty('--my', `${Math.round(event.clientY - rect.top)}px`)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
}

function Sidebar() {
  const open = useUI((s) => s.sidebarOpen)
  const setOpen = useUI((s) => s.setSidebarOpen)
  const sync = useSync()
  return (
    <>
      {open && <button className="rail-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <aside className={`rail${open ? ' is-open' : ''}`} aria-label="Primary">
        <div className="flex items-center justify-between">
          <Link to="/" onClick={() => setOpen(false)} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Mark />
          </Link>
          <button className="btn btn-quiet btn-icon lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="spine-label">The binder</div>
        <nav className="rail-links">
          {RAIL.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className="rail-link"
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} size={17} />
                  <span>{item.label}</span>
                  {isActive && <span className="rail-dot" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="label">Local first</div>
          <div className="data-sm muted mt-2">Nothing leaves this device.</div>
          <div className="data-sm mt-3" style={{ color: sync.status === 'synced' ? 'var(--positive)' : 'var(--text-3)' }}>
            {sync.status === 'synced' ? 'LAN link active' : 'Working offline'}
          </div>
          <div className="maker-mark data-sm mt-4">Made by <b>Lucky</b></div>
        </div>
      </aside>
    </>
  )
}

function TopBar() {
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const setPaletteOpen = useUI((s) => s.setPaletteOpen)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const timer = useTimer()
  const navigate = useNavigate()
  const [online, setOnline] = useState(navigator.onLine)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <header className="topbar glass" data-glass-surface>
      <div className="flex min-w-0 items-center gap-4">
        <button className="btn btn-quiet btn-icon lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Icon name="menu" size={19} />
        </button>
        <span className="data-sm dim truncate">{today.toUpperCase()}</span>
      </div>
      <div className="flex items-center gap-2">
        {!online && <span className="offline-pill">offline</span>}
        {timer.running && (
          <button className="timer-chip" onClick={() => navigate('/instrument')} title="Active focus block">
            <span className="timer-dot" />
            {displayTime(timer)}
          </button>
        )}
        <button className="btn btn-quiet btn-icon" onClick={() => setPaletteOpen(true)} aria-label="Open commands" title="Commands (Ctrl+K)">
          <Icon name="spark" size={17} />
        </button>
        <button
          className="btn btn-quiet btn-icon"
          onClick={() => setTheme(THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id)}
          aria-label="Change appearance"
          title={`Theme: ${theme}`}
        >
          <Icon name={theme === 'paper' ? 'sun' : theme === 'ink' ? 'moon' : 'spark'} size={17} />
        </button>
      </div>
    </header>
  )
}

function MobileDock() {
  const items: { to: string; label: string; icon: IconName }[] = [
    { to: '/', label: 'Today', icon: 'sun' },
    { to: '/plan', label: 'Plan', icon: 'calendar' },
    { to: '/instrument', label: 'Dial', icon: 'target' },
    { to: '/notes', label: 'Notes', icon: 'ledger' },
    { to: '/review', label: 'Review', icon: 'ledger' },
    { to: '/progress', label: 'Progress', icon: 'chart' },
  ]
  return (
    <nav className="dock glass" aria-label="Mobile" data-glass-surface>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `dock-item${item.to === '/instrument' ? ' is-centre' : ''}${isActive ? ' is-active' : ''}`}>
          {({ isActive }) => (
            <>
              <Icon name={item.icon} size={item.to === '/instrument' ? 22 : 20} strokeWidth={1.8} />
              <span>{item.label}</span>
              <span className="sr-only" data-active={isActive} />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UpdateToast() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const onReady = () => setReady(true)
    window.addEventListener('meridian:update', onReady)
    return () => window.removeEventListener('meridian:update', onReady)
  }, [])
  if (!ready) return null
  return (
    <div className="update-toast" role="status">
      <span>A new version is ready.</span>
      <button className="btn btn-sm" onClick={() => window.__meridianUpdate?.()}>Update now</button>
    </div>
  )
}

export function EditorialShell() {
  useGlassPointer()
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <BinderTabs />
        <main className="editorial">
          <Outlet />
          <div className="page-foot">
            <span>Meridian · the line between now and later</span>
            <span className="maker-mark">Made by <b>Lucky</b></span>
          </div>
        </main>
      </div>
      <MobileDock />
      <CommandPalette />
      <UpdateToast />
    </div>
  )
}
