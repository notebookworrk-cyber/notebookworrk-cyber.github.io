import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from '../../app/icons'
import { Confirm, Modal, PageHeader, SectionLabel } from '../../app/ui'
import { ACCENTS, THEMES, useUI } from '../../app/theme'
import { db, exportBackup, importBackup, setSetting, softDelete, TABLES } from '../../db/db'
import { useReminders, useSetting, useTasks, useAssessments } from '../../db/hooks'
import { touch } from '../../db/types'
import { clearPairing, getPairing, setPairing, syncNow, testConnection, useSync } from '../../sync/engine'
import type { Pairing } from '../../sync/engine'
import { requestNotifications, seedReminders, remindersToICS, enableBackgroundPush, disableBackgroundPush, pushSupported } from '../reminders/engine'
import { download } from '../../lib/download'

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rule-row">
      <div className="row-primary">
        <div className="row-title">{title}</div>
        {note && <div className="row-sub">{note}</div>}
      </div>
      {children}
    </div>
  )
}

export function Settings() {
  const hosted = window.location.hostname.endsWith('github.io')
  const sync = useSync()
  const ui = useUI()
  const dailyGoal = useSetting('dailyGoal', '120')
  const resetHorizon = useSetting('resetHorizon', '14')
  const resetHours = useSetting('resetHours', '2')
  const focusDefault = useSetting('focusDefault', '25')
  const breakDefault = useSetting('breakDefault', '5')
  const displayName = useSetting('displayName', '')
  const academicLevel = useSetting('academicLevel', '')
  const institution = useSetting('institution', '')
  const period = useSetting('period', '')
  const reminders = useReminders()
  const tasks = useTasks()
  const assessments = useAssessments()
  const [noticeState, setNoticeState] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [pushEnabled, setPushEnabled] = useState(false)
  const [url, setUrl] = useState(() => window.location.protocol === 'https:' ? window.location.origin : 'http://127.0.0.1:8788')
  const [phoneUrl, setPhoneUrl] = useState('https://192.168.31.199:8787')
  const [token, setToken] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace' | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [clearTable, setClearTable] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      if (!(await pushSupported())) return
      const reg = await navigator.serviceWorker.ready
      setPushEnabled(Boolean(await reg.pushManager.getSubscription()))
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const paired = await getPairing()
      if (paired) {
        setUrl(paired.url)
        setToken(paired.token)
        if (window.location.protocol === 'https:') setPhoneUrl(window.location.origin)
        return
      }
      const candidates = window.location.port === '5173'
        ? [window.location.origin]
        : ['http://127.0.0.1:8788', window.location.origin]
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/info`, { signal: AbortSignal.timeout(1500) })
          if (!res.ok) continue
          const info = (await res.json()) as { lan?: string[]; loopback?: string; token?: string }
          if (info.loopback) setUrl(info.loopback)
          if (info.lan?.[0]) setPhoneUrl(info.lan[0])
          if (info.token) setToken(info.token)
          break
        } catch { /* try next */ }
      }
    })()
  }, [])

  useEffect(() => {
    const pairingUrl = `${phoneUrl}/pair?token=${encodeURIComponent(token || 'PAIRING_TOKEN')}`
    void QRCode.toDataURL(pairingUrl, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(null))
  }, [phoneUrl, token])

  async function connect() {
    setBusy(true)
    setMessage('Connecting…')
    const p: Pairing = { url: url.trim(), token: token.trim() }
    const result = await testConnection(p)
    if (!result.ok) setMessage(`Couldn't connect: ${result.error ?? 'unknown error'}`)
    else {
      await setPairing(p)
      await syncNow()
      setMessage('Connected. Your devices are paired.')
    }
    setBusy(false)
  }

  async function doImport(file: File | undefined, mode: 'merge' | 'replace') {
    if (!file) return
    try {
      const count = await importBackup(await file.text(), mode)
      setMessage(`Restored ${count} records.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed')
    }
    setImportMode(null)
    setPendingFile(null)
    if (importRef.current) importRef.current.value = ''
  }

  async function resetAll() {
    await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
      for (const t of TABLES) await db[t].clear()
    })
    await db.meta.clear()
    setResetOpen(false)
    setMessage('All local records were cleared.')
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Settings · yours to keep" title="The instrument, calibrated." subtitle="Everything here lives on this device. No account, no cloud, no tracking." />

      <div className="mt-12 flex flex-col gap-14">
        <section>
          <SectionLabel>Profile</SectionLabel>
          <div className="rule-list">
            <Row title="Display name" note="Used only in this browser"><input className="input max-w-[280px]" defaultValue={displayName} onBlur={(e) => void setSetting('displayName', e.target.value)} placeholder="Your name" /></Row>
            <Row title="Academic level" note="Undergraduate, postgraduate, school…"><input className="input max-w-[280px]" defaultValue={academicLevel} onBlur={(e) => void setSetting('academicLevel', e.target.value)} /></Row>
            <Row title="Institution"><input className="input max-w-[280px]" defaultValue={institution} onBlur={(e) => void setSetting('institution', e.target.value)} /></Row>
            <Row title="Academic period"><input className="input max-w-[280px]" defaultValue={period} onBlur={(e) => void setSetting('period', e.target.value)} placeholder="e.g. Fall 2026" /></Row>
            <Row title="Daily focus goal (min)"><input className="input max-w-[140px]" type="number" min={15} value={dailyGoal} onChange={(e) => void setSetting('dailyGoal', e.target.value)} /></Row>
            <Row title="Study hours per day" note="Used by the planner as a starting capacity"><input className="input max-w-[140px]" type="number" min={0.5} step={0.5} value={resetHours} onChange={(e) => void setSetting('resetHours', e.target.value)} /></Row>
          </div>
        </section>

        <section>
          <SectionLabel>Appearance</SectionLabel>
          <div className="rule-list">
            <Row title="Theme" note="Applies to every screen, including the dial face">
              <select className="select w-auto min-w-[140px] py-2" value={ui.theme} onChange={(e) => ui.setTheme(e.target.value)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Row>
            <Row title="Accent" note="The signal colour stays recognisable in all themes">
              <select className="select w-auto min-w-[140px] py-2" value={ui.accent} onChange={(e) => ui.setAccent(e.target.value)}>{ACCENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Row>
            <Row title="Glass intensity" note="Auto chooses from your device's capabilities">
              <select className="select w-auto min-w-[160px] py-2" value={ui.glass} onChange={(e) => ui.setGlass(e.target.value as typeof ui.glass)}>
                <option value="auto">Auto · {ui.resolvedGlass}</option>
                <option value="full">Full</option>
                <option value="balanced">Balanced</option>
                <option value="performance">Performance</option>
              </select>
            </Row>
            <Row title="Density"><select className="select w-auto min-w-[140px] py-2" value={ui.density} onChange={(e) => ui.setDensity(e.target.value as typeof ui.density)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Row>
            <Row title="Motion"><select className="select w-auto min-w-[140px] py-2" value={ui.motion} onChange={(e) => ui.setMotion(e.target.value as typeof ui.motion)}><option value="auto">Auto</option><option value="full">Full</option><option value="reduced">Reduced</option></select></Row>
            <Row title="Haptic detents"><button className="btn btn-sm" onClick={() => ui.setHaptics(!ui.haptics)}>{ui.haptics ? 'On' : 'Off'}</button></Row>
            <Row title="Dial sound"><button className="btn btn-sm" onClick={() => ui.setSound(!ui.sound)}>{ui.sound ? 'On' : 'Off'}</button></Row>
          </div>
        </section>

        <section>
          <SectionLabel>Timer</SectionLabel>
          <div className="rule-list">
            <Row title="Default focus block"><input className="input max-w-[140px]" type="number" min={5} max={120} value={focusDefault} onChange={(e) => void setSetting('focusDefault', e.target.value)} /></Row>
            <Row title="Short break"><input className="input max-w-[140px]" type="number" min={1} max={60} value={breakDefault} onChange={(e) => void setSetting('breakDefault', e.target.value)} /></Row>
            <Row title="Planning horizon (days)"><input className="input max-w-[140px]" type="number" min={1} max={60} value={resetHorizon} onChange={(e) => void setSetting('resetHorizon', e.target.value)} /></Row>
            <Row title="Session completion" note="Completed blocks are saved with their chapter and notes automatically"><span className="etch etch-dim">automatic</span></Row>
          </div>
        </section>

        <section className="panel p-6 sm:p-8">
          <SectionLabel>Notifications</SectionLabel>
          <p className="muted max-w-2xl text-[13px]">{hosted ? 'In-app alerts and calendar alarms. Background push needs the laptop server.' : 'In-app alerts, background push to the installed PWA, and calendar alarms.'}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn" onClick={() => void requestNotifications().then(setNoticeState)}><Icon name="info" size={14} /> {noticeState === 'granted' ? 'Notifications on' : 'Enable alerts'}</button>
            {!hosted && <button className={`btn ${pushEnabled ? '' : 'btn-primary'}`} onClick={() => void (pushEnabled
              ? disableBackgroundPush().then(() => { setPushEnabled(false); setMessage('Background push off.') })
              : enableBackgroundPush().then((r) => { setPushEnabled(r.ok); setMessage(r.message) }))}>
              <Icon name="sync" size={14} /> {pushEnabled ? 'Push on' : 'Enable background push'}
            </button>}
            <button className="btn" onClick={() => void seedReminders(tasks, assessments).then((n) => setMessage(`Added ${n} smart reminders.`))}><Icon name="spark" size={14} /> Create smart reminders</button>
            <button className="btn" onClick={() => download('meridian-reminders.ics', remindersToICS(reminders), 'text/calendar')}><Icon name="calendar" size={14} /> Send to Calendar</button>
          </div>
          <div className="data-sm dim mt-5">Status {noticeState} · {reminders.filter((r) => r.enabled === 1).length} active</div>
          <div className="rule-list mt-5">
            {[...reminders].sort((a, b) => a.at - b.at).slice(0, 12).map((r) => (
              <div key={r.id} className="rule-row" style={{ opacity: r.enabled ? 1 : 0.45 }}>
                <button className="btn btn-quiet btn-icon" onClick={() => void db.reminders.put(touch({ ...r, enabled: r.enabled ? 0 : 1 }))} aria-label="Toggle"><Icon name={r.enabled ? 'check' : 'plus'} size={14} /></button>
                <div className="row-primary">
                  <div className="row-title truncate">{r.title}</div>
                  <div className="row-sub">{new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <button className="btn btn-quiet btn-icon" onClick={() => void softDelete('reminders', r.id)} aria-label="Delete"><Icon name="trash" size={13} /></button>
              </div>
            ))}
            {!reminders.length && <p className="muted py-6 text-[13px]">No reminders yet.</p>}
          </div>
        </section>

        <section className="panel p-6 sm:p-8">
          <SectionLabel>Privacy</SectionLabel>
          <div className="rule-list">
            <Row title="Where your data lives" note="IndexedDB on this device. The hosted copy has no server-side storage.">local only</Row>
            <Row title="External connections" note={hosted ? 'GitHub Pages loads the app. No analytics, ads or tracking requests.' : 'Optional LAN sync to your own laptop server.'}>{hosted ? 'none after install' : 'opt-in LAN'}</Row>
            <Row title="Focus shield" note="A web app cannot block other apps. A free MacroDroid recipe can open the cost screen.">
              <a className="btn btn-sm" href="/block?app=instagram">Preview</a>
            </Row>
          </div>
        </section>

        {!hosted && (
          <section className="panel p-6 sm:p-8">
            <SectionLabel right={<span className="data-sm" style={{ color: sync.status === 'synced' ? 'var(--positive)' : 'var(--text-3)' }}>{sync.status === 'synced' ? 'Connected' : sync.status === 'error' ? 'Error' : 'Offline'}</span>}>Devices · LAN sync</SectionLabel>
            <p className="muted max-w-2xl text-[13px]">Start the sync server on your laptop, then scan the code with your phone. Both devices must be on the same Wi-Fi.</p>
            <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="flex flex-col gap-4">
                <div className="field"><label>Sync server address</label><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
                <div className="field"><label>Pairing token</label><input className="input" value={token} onChange={(e) => setToken(e.target.value)} /></div>
                <div className="field"><label>Phone address</label><input className="input" value={phoneUrl} onChange={(e) => setPhoneUrl(e.target.value)} /></div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => void connect()} disabled={busy || !url.trim() || !token.trim()}><Icon name="link" size={14} /> {busy ? 'Connecting…' : 'Connect'}</button>
                  <button className="btn" disabled={sync.status === 'offline' || sync.status === 'syncing'} onClick={() => void syncNow()}><Icon name="sync" size={14} /> Sync now</button>
                  <button className="btn btn-quiet" onClick={() => { void clearPairing(); setToken(''); setMessage('Unpaired.') }}>Unpair</button>
                </div>
                <div className="data-sm muted">{sync.message} · last sync {sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString() : '—'} · {sync.conflicts} conflicts resolved</div>
                {message && <div className="text-[12px]" style={{ color: 'var(--accent)' }}>{message}</div>}
              </div>
              <div className="flex flex-col items-center gap-3">
                {qr ? <img src={qr} alt="Pairing QR code" className="border" style={{ borderColor: 'var(--line)' }} /> : <div className="h-[180px] w-[180px] border" style={{ borderColor: 'var(--line)' }} />}
                <span className="label text-center">Scan on your phone</span>
              </div>
            </div>
          </section>
        )}

        <section className="panel p-6 sm:p-8">
          <SectionLabel>Your data</SectionLabel>
          <p className="muted text-[13px]">Export everything as JSON, or restore a backup on any device. Import validates every record before it writes anything.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn" onClick={() => void exportBackup().then((json) => download(`meridian-backup-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json'))}><Icon name="download" size={14} /> Export backup</button>
            <button className="btn" onClick={() => importRef.current?.click()}><Icon name="upload" size={14} /> Import backup</button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) { setPendingFile(file); setImportMode('merge') }
            }} />
            <button className="btn btn-quiet" onClick={() => setClearTable('tasks')}>Clear selected records</button>
            <button className="btn btn-danger" onClick={() => setResetOpen(true)}>Reset everything</button>
          </div>
          {message && <div className="data-sm mt-4" style={{ color: 'var(--accent)' }}>{message}</div>}
          <p className="dim mt-5 text-[11px]">Pairing credentials and sync cursors are never included in a backup.</p>
        </section>

        <section className="flex flex-wrap items-end justify-between gap-4 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
          <div>
            <div className="display display-md">Meridian</div>
            <div className="label mt-2">The line between now and later. v2.0</div>
            <div className="dim mt-2 text-[12px]">Local-first · offline PWA · no tracking</div>
          </div>
          <a className="btn" href="https://github.com/notebookworrk-cyber/notebookworrk-cyber.github.io" target="_blank" rel="noreferrer">Source on GitHub</a>
        </section>
      </div>

      <Modal open={importMode != null} onClose={() => setImportMode(null)} title="Import backup">
        <p className="muted text-[13px]">
          {importMode === 'replace'
            ? 'Replace will clear every table before restoring. This cannot be undone.'
            : 'Merge keeps both copies of a record when they differ, using the newer version.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void doImport(pendingFile ?? undefined, importMode ?? 'merge')}>Continue</button>
          <button className="btn btn-quiet" onClick={() => setImportMode(null)}>Cancel</button>
        </div>
      </Modal>
      <Confirm open={clearTable != null} onClose={() => setClearTable(null)} title="Clear records?" description={`All records in ${clearTable} will be removed from this device.`} onConfirm={() => {
        if (!clearTable || !(TABLES as readonly string[]).includes(clearTable)) return
        const table = db as unknown as Record<string, { clear: () => Promise<void> }>
        void table[clearTable].clear()
      }} />
      <Confirm open={resetOpen} onClose={() => setResetOpen(false)} title="Reset everything?" description="Every course, chapter, session and preference on this device will be deleted. Export a backup first if you might want it back." onConfirm={() => void resetAll()} />
    </div>
  )
}
