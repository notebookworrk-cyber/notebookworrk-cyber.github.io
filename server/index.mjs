import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const CERT_DIR = path.join(ROOT, 'certs')
const DIST_DIR = path.join(ROOT, 'dist')
const CONFIG = path.join(DATA_DIR, 'server.json')
const PORT = Number(process.env.PORT || 8787)

fs.mkdirSync(DATA_DIR, { recursive: true })

function loadConfig() {
  if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  const config = { token: crypto.randomBytes(24).toString('hex'), createdAt: Date.now() }
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2), { mode: 0o600 })
  return config
}
const config = loadConfig()

const VAPID_FILE = path.join(DATA_DIR, 'vapid.json')
function loadVapid() {
  if (fs.existsSync(VAPID_FILE)) return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'))
  const keys = generateVAPIDKeys()
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 })
  return keys
}
const vapid = loadVapid()
setVapidDetails('mailto:meridian@local', vapid.publicKey, vapid.privateKey)

const db = new DatabaseSync(path.join(DATA_DIR, 'meridian.sqlite'))
db.exec(`
  CREATE TABLE IF NOT EXISTS changes (
    table_name TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    rev INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (table_name, id)
  );
  CREATE INDEX IF NOT EXISTS idx_changes_updated ON changes(updated_at);
  CREATE TABLE IF NOT EXISTS push_subs (
    id TEXT PRIMARY KEY,
    subscription TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_log (
    key TEXT PRIMARY KEY,
    sent_at INTEGER NOT NULL
  );
`)

const TABLES = new Set([
  'courses', 'assessments', 'topics', 'tasks', 'sessions', 'plans', 'settings',
  'unlocks', 'reminders', 'recalls', 'commitments',
])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

function allowedOrigin(origin) {
  if (!origin) return true
  try {
    const url = new URL(origin)
    const host = url.hostname
    const local = host === 'localhost' || host === '127.0.0.1' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)
    return local && ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

function send(req, res, status, body, type = 'application/json; charset=utf-8') {
  const origin = String(req.headers.origin ?? '')
  res.writeHead(status, {
    'Content-Type': type,
    ...(allowedOrigin(origin) && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'Content-Type, X-Meridian-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

// Small per-IP limit. This is a local LAN server, not a public endpoint.
const hits = new Map()
function rateLimited(req) {
  const key = req.socket.remoteAddress ?? 'unknown'
  const now = Date.now()
  const entry = hits.get(key) ?? { start: now, count: 0 }
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0 }
  entry.count++
  hits.set(key, entry)
  if (hits.size > 500) hits.clear()
  return entry.count > 180
}

function authorized(req) {
  const supplied = req.headers['x-meridian-token'] ?? ''
  const a = Buffer.from(String(supplied))
  const b = Buffer.from(config.token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 5_000_000) req.destroy()
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function staticFile(req, res, pathname) {
  const clean = decodeURIComponent(pathname).replace(/\\/g, '/')
  const safe = path.normalize(clean).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(DIST_DIR, safe)
  if (!file.startsWith(DIST_DIR)) return send(req, res, 403, 'Forbidden', 'text/plain')
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html')
  if (!fs.existsSync(file)) {
    return send(req, res, 503, '<h1>Meridian</h1><p>Build the app first: <code>npm run build</code></p>', 'text/html; charset=utf-8')
  }
  const ext = path.extname(file).toLowerCase()
  const origin = String(req.headers.origin ?? '')
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    ...(allowedOrigin(origin) && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Referrer-Policy': 'no-referrer',
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    if (rateLimited(req)) return send(req, res, 429, { error: 'too many requests' })
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = url.pathname

    if (req.method === 'OPTIONS') return send(req, res, 204, '')

    if (pathname === '/pair') {
      const token = url.searchParams.get('token') ?? ''
      const a = Buffer.from(token)
      const b = Buffer.from(config.token)
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(req, res, 403, 'Invalid pairing token', 'text/plain')
      const encoded = encodeURIComponent(token)
      res.writeHead(302, { Location: `/?pair=${encoded}` })
      return res.end()
    }

    if (pathname === '/api/info') {
      const scheme = fs.existsSync(path.join(CERT_DIR, 'meridian-key.pem')) ? 'https' : 'http'
      const ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
      return send(req, res, 200, {
        secure: scheme === 'https',
        lan: ifaces.map((i) => `${scheme}://${i.address}:${PORT}`),
        local: `${scheme}://localhost:${PORT}`,
        loopback: `http://127.0.0.1:${PORT + 1}`,
        // Only the loopback listener may hand out the pairing token.
        token: req.socket.localPort === PORT + 1 ? config.token : undefined,
      })
    }

    if (pathname === '/api/push/key') {
      return send(req, res, 200, { publicKey: vapid.publicKey })
    }

    if (pathname === '/api/push/subscribe' && req.method === 'POST') {
      if (!authorized(req)) return send(req, res, 401, { error: 'unauthorized' })
      const { subscription } = await body(req)
      if (!subscription?.endpoint) return send(req, res, 400, { error: 'invalid subscription' })
      const id = crypto.createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 24)
      db.prepare('INSERT OR REPLACE INTO push_subs (id, subscription) VALUES (?, ?)').run(id, JSON.stringify(subscription))
      return send(req, res, 200, { ok: true, id })
    }

    if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
      if (!authorized(req)) return send(req, res, 401, { error: 'unauthorized' })
      const { endpoint } = await body(req)
      const id = crypto.createHash('sha256').update(String(endpoint ?? '')).digest('hex').slice(0, 24)
      db.prepare('DELETE FROM push_subs WHERE id = ?').run(id)
      return send(req, res, 200, { ok: true })
    }

    if (pathname === '/api/health') {
      if (!authorized(req)) return send(req, res, 401, { ok: false, error: 'unauthorized' })
      return send(req, res, 200, { ok: true, name: 'meridian-sync', version: 1 })
    }

    if (pathname === '/api/push' && req.method === 'POST') {
      if (!authorized(req)) return send(req, res, 401, { error: 'unauthorized' })
      const payload = await body(req)
      const changes = payload.changes ?? {}
      let applied = 0
      let conflicts = 0
      const authoritative = {}
      const upsert = db.prepare(`
        INSERT INTO changes (table_name, id, updated_at, deleted_at, rev, payload)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(table_name, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          rev = excluded.rev,
          payload = excluded.payload
      `)
      const select = db.prepare('SELECT updated_at, payload FROM changes WHERE table_name = ? AND id = ?')
      for (const [table, rows] of Object.entries(changes)) {
        if (!TABLES.has(table) || !Array.isArray(rows)) continue
        for (const row of rows) {
          if (!row?.id || typeof row.updatedAt !== 'number') continue
          const existing = select.get(table, row.id)
          if (existing && existing.updated_at > row.updatedAt) {
            conflicts++
            ;(authoritative[table] ??= []).push(JSON.parse(existing.payload))
            continue
          }
          upsert.run(table, row.id, row.updatedAt, row.deletedAt ?? null, row.rev ?? 1, JSON.stringify(row))
          applied++
        }
      }
      return send(req, res, 200, { applied, conflicts, authoritative, cursor: Date.now() })
    }

    if (pathname === '/api/pull') {
      if (!authorized(req)) return send(req, res, 401, { error: 'unauthorized' })
      const since = Number(url.searchParams.get('since') ?? 0) || 0
      const rows = db.prepare('SELECT table_name, payload FROM changes WHERE updated_at > ? ORDER BY updated_at ASC').all(since)
      const changes = {}
      for (const r of rows) {
        ;(changes[r.table_name] ??= []).push(JSON.parse(r.payload))
      }
      return send(req, res, 200, { changes, cursor: Date.now(), count: rows.length })
    }

    return staticFile(req, res, pathname)
  } catch (e) {
    return send(req, res, 500, { error: e instanceof Error ? e.message : 'server error' })
  }
})

const keyPath = path.join(CERT_DIR, 'meridian-key.pem')
const certPath = path.join(CERT_DIR, 'meridian-cert.pem')
async function sendDuePushes() {
  try {
    const now = Date.now()
    const rows = db.prepare("SELECT id, payload FROM changes WHERE table_name = 'reminders'").all()
    const subs = db.prepare('SELECT id, subscription FROM push_subs').all()
    if (!subs.length) return
    const already = db.prepare('SELECT 1 FROM push_log WHERE key = ?')
    const logIt = db.prepare('INSERT OR REPLACE INTO push_log (key, sent_at) VALUES (?, ?)')
    const drop = db.prepare('DELETE FROM push_subs WHERE id = ?')
    for (const row of rows) {
      let reminder
      try { reminder = JSON.parse(row.payload) } catch { continue }
      if (reminder.deletedAt != null || reminder.enabled !== 1) continue
      if (reminder.at > now || reminder.at < now - 10 * 60_000) continue
      const key = `${reminder.id}:${reminder.at}`
      if (already.get(key)) continue
      for (const sub of subs) {
        try {
          await sendNotification(JSON.parse(sub.subscription), JSON.stringify({
            title: reminder.title,
            body: reminder.note || 'Meridian reminder',
            icon: '/icon-192.png',
          }))
        } catch (e) {
          const status = e?.statusCode
          if (status === 404 || status === 410) drop.run(sub.id)
        }
      }
      logIt.run(key, now)
    }
  } catch {
    // scheduler is best-effort
  }
}
setInterval(() => void sendDuePushes(), 30_000).unref()

const handler = server.listeners('request')[0]
let listener = server

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  listener = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handler)
}

const listeners = [listener]
if (listener !== server) {
  listeners.push(http.createServer(handler))
}

listener.listen(PORT, '0.0.0.0', () => {
  const secure = listener !== server
  const scheme = secure ? 'https' : 'http'
  const ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
  console.log('')
  console.log('  MERIDIAN SYNC')
  console.log('  ────────────────────────────────────────────')
  console.log(`  Laptop:  ${secure ? `http://127.0.0.1:${PORT + 1} (no cert needed)` : `http://localhost:${PORT}`}`)
  if (secure) console.log(`  Local:   ${scheme}://localhost:${PORT}`)
  for (const i of ifaces) console.log(`  Phone:   ${scheme}://${i.address}:${PORT}`)
  console.log(`  Token:   ${config.token}`)
  console.log('')
  if (!secure) console.log('  ⚠ HTTPS not configured. Run: npm run cert:init')
  console.log('  Stop with Ctrl+C')
  console.log('')
})

if (listeners.length > 1) listeners[1].listen(PORT + 1, '127.0.0.1')

function shutdown() {
  try { db.close() } catch {}
  let left = listeners.length
  for (const l of listeners) l.close(() => { if (--left === 0) process.exit(0) })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
