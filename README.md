# Meridian — where your attention becomes progress

A local-first study operating system for your phone and laptop. It answers five questions: what to study, why now, how long, what you actually remember, and how to adjust when real life interrupts the plan.

**Live app:** https://notebookworrk-cyber.github.io/
**Source:** https://github.com/notebookworrk-cyber/notebookworrk-cyber.github.io

Built by **Lucky**. Meridian 3.0 keeps the 2.0 engines and adds a physical binder UI, liquid-glass chrome, a Notes workspace and the front-door deficit.

## The core of Meridian 3.0

1. **Today** — one recommended move with a real reason, the day sheet with fixed commitments, a revision queue, and a one-tap launch that sets the chapter, picks a duration and opens the dial.
2. **The Instrument** — the physical five-minute dial is preserved. Turn to set, press to begin, turn while running to re-time, hold to bank. Chapters carry confidence, estimates, leverage and revision state. A long suspension produces a recovery dialog instead of a fantastical session.
3. **Rescue My Day** — rebuild only what still fits. Completed sessions and fixed commitments stay; every moved or deferred block carries a reason. Accept, modify or reject — nothing is deleted silently.
4. **Recall Loop** — active recall tied to chapters. Four honest ratings move along a 1/3/7/14/30-day ladder, update confidence, and drive a due/overdue/weak queue. No invented scores, no generated questions.
5. **Focus Studio + Audio Studio** — a responsive concentration workspace with notes, wake lock and optional reflection. Ambience is generated locally with the Web Audio API (rain, wind, ocean, fire, white/pink/brown noise, quiet room). No Spotify, no downloads, no accounts.
6. **Progress** — the line: usable hours before the exam against the hours your chapters need, with readiness evidence including missing data, patterns, estimate-vs-actual flight recorder, grade what-if and a locally generated Statement.
7. **Today's front door** — a deficit headline and one recommended move instead of a stack of cards.
8. **Notes** — a binder of pages. Write with a small Markdown toolbar, import PDFs, images and text, write on them with pen/highlighter/eraser, dictate with the browser's speech service, search everything, and send a selected line into Review as a recall task.
9. **Settings** — searchable, grouped navigation with a live appearance preview, profile, timer, notifications, privacy, data, devices, and an About card made by Lucky.

Navigation: the desktop rail is now a **spine**, with section tabs protruding from the page. On mobile a glass dock keeps the dial at the centre. Paper holds the work; liquid glass is reserved for chrome (top bar, dock, sheets, palette, audio panel). Three glass tiers (Full / Balanced / Performance) and reduced-motion/reduced-transparency paths keep it usable on modest hardware. The front page leads with the deficit and one recommended move instead of a stack of cards.

## Install on your phone

The hosted copy needs no certificate, firewall or server.

1. Open https://notebookworrk-cyber.github.io/ in Chrome on Android.
2. Add `?demo=1` for sample data on first load.
3. Use **⋮ → Install app**. Open it from the home screen.

The hosted copy is standalone: data lives in that browser only. Move it with **Settings → Your data → Export/Import backup**. Hosted builds hide LAN sync and background push because neither can work without the laptop server.

For live phone ↔ laptop sync, run the local server instead: `start.bat` (or `npm run server`).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run check` | Typecheck + unit tests + production build |
| `npm test` | Vitest unit suite |
| `npm run check:ui` | Browser checks via system Chrome (start `npm run preview -- --port 4173` first) |
| `npm run check:offline` | Service-worker offline reload check |
| `npm run check:pdf` | Renders a generated PDF in Notes and verifies ink capture |
| `npm run build` | Production build into `dist/` (+ SPA `404.html`) |
| `npm run server` | HTTPS 8787 / loopback 8788 sync server |
| `npm run cert:init` | Local CA + certificate |
| `npm run cert:ip -- <ip>` | Reissue certificate for a changed Wi-Fi IP |
| `npm run icons` | Regenerate PWA icons |

## Local sync (optional)

Start the server, then in **Settings → Devices** scan the QR code on the phone. Data syncs every 30 seconds, on reconnect, and on demand. Conflicts use last-write-wins per record and are counted in Settings.

- Laptop: `http://127.0.0.1:8788` (no certificate).
- Phone: `https://192.168.x.y:8787` (install `certs/meridian-ca.crt` once).
- If Wi-Fi changes the IP, run `npm run cert:ip -- <new-ip>`.

The server requires a random pairing token, uses timing-safe comparison, limits request size and rate, restricts CORS to local origins, and sends no study data in push payloads.

## Focus Shield on Android

A web app cannot block other apps. MacroDroid (free) bridges that gap:

1. MacroDroid → **Application Launched** → Instagram / YouTube / TikTok / etc.
2. **Open Website/Link** → `https://192.168.x.y:8787/block?app=instagram`.
3. Optional constraint: only during study hours.

The shield shows a calculated cost screen and a deliberate hold-to-open. Nothing is shaming or invented; distraction entries are local and clearable.

## Where your data lives

- Browser: IndexedDB `meridian` (schema v4). Works offline. Notes pages and annotations are backed up; imported files are not.
- Laptop: `data/meridian.sqlite`.
- Pairing token: `data/server.json` (private). VAPID keys: `data/vapid.json`. Certificates: `certs/` (gitignored).

Backups are versioned JSON with validation before any write. Pairing credentials, sync cursors and imported file blobs are never included. Import supports merge (newer wins) and explicit-confirmation replace. Legacy v1 backups still import.

Notes format reality: PDF, images, TXT and MD render inline; DOCX/PPTX and other files are stored and can be opened in another app. Dictation uses the browser's speech service and needs a connection — audio is never sent to Meridian.

## Limits, honestly

- Native app blocking needs MacroDroid; the PWA cannot do it alone.
- Background push on the hosted copy needs a server; GitHub Pages cannot provide it.
- AirBoard and Gesture Link are separate applications with no shipped command API. Meridian defines a local integration contract but does not claim a live connection.
- Readiness, the deficit and recommendations are heuristics from your own records, not predictions or grades.
- PDF rendering uses the locally bundled `pdfjs-dist` engine; very large PDFs use memory while open and are not copied into backups.
- Breaks are excluded from attention totals; sessions under one minute are not saved.
- No accounts, no cloud, no analytics, no advertising, no paid APIs.

Architecture, features and integration contracts are in [`docs/`](./docs).
