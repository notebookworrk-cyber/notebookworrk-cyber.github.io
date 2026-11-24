import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { Icon } from '../../app/icons'
import { SectionLabel } from '../../app/ui'
import { InstrumentPage } from '../instrument/InstrumentPage'
import { db, exportBackup, importBackup, setSetting, softDelete } from '../../db/db'
import { useAssessments, useReminders, useSetting, useTasks } from '../../db/hooks'
import { touch } from '../../db/types'
import { clearPairing, getPairing, setPairing, syncNow, testConnection, useSync } from '../../sync/engine'
import type { Pairing } from '../../sync/engine'
import { requestNotifications, seedReminders, remindersToICS, enableBackgroundPush, disableBackgroundPush, pushSupported } from '../reminders/engine'

function download(name: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Settings() {
  const hosted = window.location.hostname.endsWith('github.io')
  const sync = useSync()
  const dailyGoal = useSetting('dailyGoal', '120')
  const resetHorizon = useSetting('resetHorizon', '14')
  const resetHours = useSetting('resetHours', '2')
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
    void QRCode.toDataURL(pairingUrl, { width: 260, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null))
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

  async function doImport(file: File | undefined) {
    if (!file) return
    try {
      const count = await importBackup(await file.text(), 'merge')
      setMessage(`Restored ${count} records.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed')
    }
    if (importRef.current) importRef.current.value = ''
  }

  return (
    <InstrumentPage title="settings" note="yours to keep">

      <section>
        <SectionLabel>Surface</SectionLabel>
        <div className="rule-list">
          <div className="rule-row">
            <span className="h-2 w-2" style={{ background: '#131211', outline: '1px solid var(--line)' }} />
            <div className="row-primary">
              <div className="row-title">graphite</div>
              <div className="row-sub">the instrument is always dark</div>
            </div>
            <span className="etch etch-dim">fixed</span>
          </div>
          <div className="rule-row">
            <span className="h-2 w-2" style={{ background: '#e2452a' }} />
            <div className="row-primary">
              <div className="row-title">vermilion</div>
              <div className="row-sub">one signal, used only for now</div>
            </div>
            <span className="etch etch-dim">fixed</span>
          </div>
          <div className="rule-row">
            <div className="row-primary">
              <div className="row-title">dial sound</div>
              <div className="row-sub">detent tick and haptic feedback</div>
            </div>
            <Link to="/" className="etch etch-live">on the dial →</Link>
          </div>
          {hosted && (
            <div className="rule-row">
              <div className="row-primary">
                <div className="row-title">hosted copy</div>
                <div className="row-sub">your data stays in this browser — use a backup file to move it</div>
              </div>
              <span className="etch etch-dim">offline</span>
            </div>
          )}
        </div>
      </section>

      {!hosted && (
        <section className="panel p-6 sm:p-8">
          <SectionLabel right={
            <span className="data-sm" style={{ color: sync.status === 'synced' ? 'var(--positive)' : 'var(--text-3)' }}>
              {sync.status === 'synced' ? 'Connected' : sync.status === 'error' ? 'Error' : 'Offline'}
            </span>
          }>LAN sync</SectionLabel>
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
              {qr ? <img src={qr} alt="Pairing QR code" className="border" style={{ borderColor: 'var(--line)' }} /> : <div className="h-[200px] w-[200px] border" style={{ borderColor: 'var(--line)' }} />}
              <span className="label text-center">Scan on your phone</span>
            </div>
          </div>
        </section>
      )}

      <section>
        <SectionLabel>Preferences</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="field"><label>Daily focus goal (min)</label><input className="input" type="number" min={15} value={dailyGoal} onChange={(e) => void setSetting('dailyGoal', e.target.value)} /></div>
          <div className="field"><label>Reset horizon (days)</label><input className="input" type="number" min={1} value={resetHorizon} onChange={(e) => void setSetting('resetHorizon', e.target.value)} /></div>
          <div className="field"><label>Hours per study day</label><input className="input" type="number" min={0.5} step={0.5} value={resetHours} onChange={(e) => void setSetting('resetHours', e.target.value)} /></div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <SectionLabel>Reminders</SectionLabel>
        <p className="muted max-w-2xl text-[13px]">{hosted ? 'In-app alerts and calendar alarms for the ones that must ring.' : 'In-app alerts, background push to the installed PWA, and calendar alarms for the ones that must ring.'}</p>
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
        <SectionLabel>Focus shield</SectionLabel>
        <p className="muted max-w-2xl text-[13px]">A web app can't block other apps by itself. A free MacroDroid recipe opens Meridian's cost screen when one of these apps launches. Setup steps are in the README.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['Instagram', 'YouTube / Shorts', 'TikTok', 'Snapchat', 'Reddit'].map((label) => <span key={label} className="chip">{label}</span>)}
        </div>
        <a className="btn mt-6" href="/block?app=instagram"><Icon name="warning" size={14} /> Preview the cost screen</a>
      </section>

      <section className="panel p-6 sm:p-8">
        <SectionLabel>Your data</SectionLabel>
        <p className="muted text-[13px]">Export everything as JSON, or restore a backup on any device. No account, no cloud.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn" onClick={() => void exportBackup().then((json) => download(`meridian-backup-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json'))}><Icon name="download" size={14} /> Export backup</button>
          <button className="btn" onClick={() => importRef.current?.click()}><Icon name="upload" size={14} /> Import backup</button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
        </div>
        {message && <div className="data-sm mt-4" style={{ color: 'var(--accent)' }}>{message}</div>}
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="display display-md">Meridian</div>
          <div className="label mt-2">The line between now and later. v0.1</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Local-first', 'Offline PWA', 'No tracking'].map((s) => <span key={s} className="chip">{s}</span>)}
        </div>
      </section>
    </InstrumentPage>
  )
}
