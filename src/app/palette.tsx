import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './icons'
import { useUI } from './theme'
import { db, exportBackup } from '../db/db'
import { stamp, uid } from '../db/types'
import { useCourses } from '../db/hooks'
import { download } from '../lib/download'

interface Command {
  id: string
  label: string
  hint: string
  icon: IconName
  run: () => void
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.setPaletteOpen)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const navigate = useNavigate()
  const courses = useCourses()
  const [query, setQuery] = useState('')
  const [capture, setCapture] = useState('')
  const [captureCourse, setCaptureCourse] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCapture('')
    setSaved(false)
    setActive(0)
    const id = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(id)
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to)
      setOpen(false)
    }
    return [
      { id: 'focus', label: 'Start focus', hint: 'Open the instrument', icon: 'target', run: go('/instrument?start=1') },
      { id: 'task', label: 'Add task', hint: 'Plan → backlog', icon: 'plus', run: go('/plan?add=task') },
      { id: 'chapter', label: 'Add chapter', hint: 'Plan → chapters', icon: 'book', run: go('/plan?add=chapter') },
      { id: 'course', label: 'Add course', hint: 'Plan → courses', icon: 'calendar', run: go('/plan?add=course') },
      { id: 'rescue', label: 'Rescue my day', hint: 'Rebuild what remains today', icon: 'reset', run: go('/plan?rescue=1') },
      { id: 'review', label: 'Open review', hint: 'Recall loop', icon: 'ledger', run: go('/review') },
      { id: 'plan', label: 'Open plan', hint: 'Week and backlog', icon: 'calendar', run: go('/plan') },
      { id: 'progress', label: 'Open progress', hint: 'Evidence and statement', icon: 'chart', run: go('/progress') },
      { id: 'settings', label: 'Open settings', hint: 'Preferences and data', icon: 'settings', run: go('/settings') },
      {
        id: 'theme',
        label: 'Switch appearance',
        hint: `Currently ${theme}`,
        icon: theme === 'paper' ? 'sun' : 'moon',
        run: () => {
          setTheme(theme === 'paper' ? 'ink' : 'paper')
          setOpen(false)
        },
      },
      {
        id: 'export',
        label: 'Export backup',
        hint: 'Local JSON file',
        icon: 'download',
        run: () => {
          void exportBackup().then((json) =>
            download(`meridian-backup-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json'),
          )
          setOpen(false)
        },
      },
      { id: 'shield', label: 'Focus shield', hint: 'Preview the cost screen', icon: 'warning', run: go('/block?app=instagram') },
    ]
  }, [navigate, setOpen, setTheme, theme])

  const filtered = commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => {
    setActive(0)
  }, [query])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(filtered.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && query && !saved) {
      e.preventDefault()
      void saveCapture()
    } else if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault()
      filtered[active].run()
    }
  }

  async function saveCapture() {
    if (!capture.trim()) return
    await db.tasks.add(
      stamp({
        id: uid(),
        title: capture.trim(),
        courseId: captureCourse || null,
        dueAt: null,
        priority: 2,
        estimateMin: 25,
        done: 0,
        note: '',
        source: 'quick-capture',
      }),
    )
    setCapture('')
    setSaved(true)
    window.setTimeout(() => setOpen(false), 500)
  }

  if (!open) return null
  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-search">
          <Icon name="spark" size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, or type a task to capture it…"
            aria-label="Search commands"
          />
          <button className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>esc</button>
        </div>
        {query.trim() ? (
          <div className="palette-capture">
            <label className="label">Quick capture</label>
            <input className="input" value={capture} onChange={(e) => setCapture(e.target.value)} placeholder={query} aria-label="Task title" />
            <select className="select" value={captureCourse} onChange={(e) => setCaptureCourse(e.target.value)} aria-label="Course">
              <option value="">No course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => void saveCapture()} disabled={!capture.trim()}>
              {saved ? 'Saved' : 'Save task'} <span className="dim">↵</span>
            </button>
          </div>
        ) : (
          <div className="palette-list">
            {filtered.map((c, i) => (
              <button key={c.id} className={`palette-item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={c.run}>
                <Icon name={c.icon} size={16} />
                <span className="palette-label">{c.label}</span>
                <span className="palette-hint">{c.hint}</span>
              </button>
            ))}
            {!filtered.length && <p className="muted p-6 text-[13px]">No matching command.</p>}
          </div>
        )}
        <div className="palette-foot">Type to capture a task · ↑ ↓ to choose · enter to run</div>
      </div>
    </div>
  )
}
