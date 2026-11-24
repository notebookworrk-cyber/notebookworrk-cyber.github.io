import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'dial' },
  { to: '/plan', label: 'plan' },
  { to: '/progress', label: 'progress' },
  { to: '/block?app=instagram', label: 'shield' },
  { to: '/settings', label: 'settings' },
]

export function InstrumentPage({
  title,
  note,
  actions,
  children,
}: {
  title: string
  note?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="instrument-surface instrument-page">
      <div className="instrument-wrap">
        <header className="instrument-head">
          <Link to="/" className="instrument-wordmark" style={{ textDecoration: 'none' }}>
            <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden="true">
              <path d="M7 1v20" stroke="currentColor" strokeWidth="1" opacity=".45" />
              <circle cx="7" cy="15" r="2.6" fill="currentColor" />
            </svg>
            <span>meridian</span>
          </Link>
          <Link to="/" className="etch etch-dim">◂ dial</Link>
        </header>

        <div className="instrument-page-head">
          <h1 className="instrument-page-title">{title}</h1>
          {note && <div className="etch etch-dim">{note}</div>}
          {actions && <div className="instrument-page-actions">{actions}</div>}
        </div>

        <div className="instrument-content">{children}</div>

        <footer className="instrument-rail">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </footer>
      </div>
    </div>
  )
}
