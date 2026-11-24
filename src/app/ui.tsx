import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="fade-in pb-8" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="label mb-3">{eyebrow}</div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="display display-lg">{title}</h1>
          {subtitle && <p className="muted mt-4 max-w-2xl text-[14px]">{subtitle}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="label shrink-0 whitespace-nowrap">{children}</div>
      {right}
    </div>
  )
}

export function NowLine({ label, style }: { label?: string; style?: CSSProperties }) {
  return (
    <div className="flex items-center gap-0" aria-hidden="true" style={style}>
      <div className="now-line flex-1" />
      {label && <span className="now-tag">{label}</span>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    document.body.classList.add('modal-open')
    const dialog = dialogRef.current
    const focusable = () =>
      [...(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])]
    const id = window.setTimeout(() => focusable()[0]?.focus(), 20)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal-card"
        style={{ maxWidth: wide ? 720 : 520 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <div className="display display-sm">{title}</div>
          <button className="btn btn-icon btn-quiet" onClick={onClose} aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-8">{children}</div>
      </div>
    </div>
  )
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="muted text-[14px]">{description}</p>
      <div className="mt-8 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={() => { onConfirm(); onClose() }}>Delete</button>
      </div>
    </Modal>
  )
}

export function EmptyState({
  icon = 'book',
  title,
  hint,
  action,
}: {
  icon?: IconName
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-5 h-8 w-8" style={{ background: 'var(--line)' }} aria-hidden="true" />
      <div className="display display-sm">{title}</div>
      {hint && <p className="muted mt-3 max-w-xs text-[13px]">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="dim text-[11px]">{hint}</span>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} data-active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="progress-track h-[2px] w-full overflow-hidden">
      <div className="progress-fill h-full" style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }} />
    </div>
  )
}

export function CourseDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="course-dot" style={{ width: size, height: size, background: color }} />
}

export function Stat({ label, value, icon, note }: { label: string; value: string; icon?: IconName; note?: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="label">{label}</span>
        {icon && <span className="dim"><Icon name={icon} size={16} /></span>}
      </div>
      <div className="display display-md mt-4">{value}</div>
      {note && <div className="dim mt-2 text-[11px]">{note}</div>}
    </div>
  )
}

export function Group({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="label">{title}</h2>}
          {action}
        </div>
      )}
      <div className="rule-list">{children}</div>
    </section>
  )
}

export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  destructive,
}: {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  destructive?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="rule-row" onClick={onClick} style={destructive ? { color: 'var(--coral)' } : undefined}>
      {leading}
      <div className="row-primary">
        <div className="row-title truncate">{title}</div>
        {subtitle && <div className="row-sub truncate">{subtitle}</div>}
      </div>
      {trailing}
    </Tag>
  )
}
