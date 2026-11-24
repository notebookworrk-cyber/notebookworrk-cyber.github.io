# Meridian — the line between now and later

A local-first study planner for your phone and laptop. It answers three questions: what should you study next, how ready are you, and what does distraction actually cost.

**Features:** a physical dial as the home surface, leverage-based chapter rack, Readiness ranges, grade what-if, Focus Shield cost screen, weekly Statement card, reminders + calendar alarms + Web Push, ICS import/export, JSON backup, offline PWA, LAN sync.

## The three things that make it different

1. **The dial** — the app opens on a machined control, not a dashboard. Turn it to set 5–90 minutes in detents with a tick and a haptic click. Press the centre to begin, turn it while running to re-time, hold to bank the minutes. The chapter rack under it holds the three moves worth making, ranked by readiness gained per minute.
2. **Leverage and Readiness** — an honest range (`64–75%`) per course, blended from chapters, confidence, graded scores and recent pace. The rack names the single chapter that moves it most: "Aromaticity → +13% in 22 min".
3. **The Cost** — when you open Instagram or Shorts, the shield shows the price in your own currency: minutes lost, readiness lost, streak at risk. Back to focus is one tap; opening the app requires a deliberate 3-second hold, logged as a withdrawal.

The weekly **Statement** turns that into a shareable receipt — made on your device, nothing uploaded.

**Visual system:** an instrument throughout — graphite surface, engraved lowercase mono, one vermilion signal, ruled lists instead of cards, Newsreader for the few things worth reading. The dial is the only moving part.

---

## Install on your phone

The hosted copy is at **https://notebookworrk-cyber.github.io/** — no certificate, no firewall, no server needed.

1. Open the URL in **Chrome** on your Android phone.
2. Add `?demo=1` if you want sample data on first load.
3. Chrome menu **⋮ → Install app**. Open it from the home screen.

The hosted copy is standalone: your data lives in that browser only. To move data between the hosted copy and the LAN version, use **settings → Your data → Export/Import backup**. The public build deliberately hides LAN sync and background push, since neither can work without the laptop server.

For phone + laptop sync with live push, run `node server/index.mjs` or `start.bat` and use the LAN instructions below instead.

---

## First-time setup (already done on this machine)

Node 24 and dependencies are installed. If you move the folder:

```powershell
npm install
npm run icons
npm run cert:init
npm run check
```

`cert:init` creates a local certificate authority and an HTTPS certificate for `meridian.local`, `localhost`, `127.0.0.1` and your current Wi-Fi IP.

---

## Start it

Double-click **`start.bat`**. It prints three addresses:

| For | Address | Cert needed? |
|---|---|---|
| Laptop (browser) | `http://127.0.0.1:8788` | No |
| Laptop (HTTPS, optional) | `https://localhost:8787` | Yes |
| Phone (same Wi-Fi) | `https://192.168.x.y:8787` | Yes, once |

The laptop address is a loopback-only HTTP port — no certificate installation needed. Both ports talk to the same SQLite database.

Stop the server with `Ctrl+C` in the window, or close it.

---

## Pair the two devices

**Laptop:** open `http://127.0.0.1:8788` → **Settings**. The sync address, token and phone address are filled in automatically from the running server. Click **Connect**. Status should become `Up to date`.

**Phone:**
1. Copy `certs/meridian-ca.crt` to the phone and install it once:
   Android → Settings → Security → Install from storage → **CA certificate**.
2. In laptop Settings, check **Phone address** matches the address printed by `start.bat`.
3. Scan the QR code shown in Settings. The phone opens Meridian at the HTTPS address and pairs automatically.
4. Add to home screen from the browser menu. It now works offline.

Data syncs every 30 seconds, on reconnect, and on demand with **Sync now**. Conflicts use last-write-wins per record and are counted in Settings.

> If your Wi-Fi IP changes, run `npm run cert:ip -- <new-ip>`, then update **Phone address** in Settings. A DHCP reservation in your router avoids this entirely.

---

## Focus Shield on Android (5 minutes)

A web app cannot block other apps by itself — Android won't allow it. MacroDroid bridges the gap:

1. Install **MacroDroid** (free).
2. New macro → **Trigger → Application Launched** → select `Instagram`, `YouTube`, `TikTok`, `Snapchat`, `Reddit`.
3. **Action → Open Website/Link** → `https://192.168.x.y:8787/block?app=instagram`.
   Use the phone address printed by `start.bat`, and swap the `app` value: `instagram`, `youtube`, `shorts`, `tiktok`, `snapchat`, `reddit`, `twitter`.
4. Optional: add a constraint so it only fires during your study hours.

When it fires, Meridian shows the **cost screen**: the readiness and streak you are about to spend. "Back to focus" is always one tap. "Hold 3s to open anyway" is deliberate, logs a 5-minute withdrawal, then opens the app via an Android `intent://` link.

You can preview the screen from **Settings → Focus shield**.

## Reminders

- **Settings → Enable alerts** grants notification permission (Android Chrome, iOS 16.4+ with the app installed).
- **Enable background push** subscribes the installed PWA via VAPID/Google FCM. The laptop's sync server sends generic nudges from queued reminders — this fires even when Meridian is closed and the phone is on mobile data, as long as the laptop is online. No study data is sent in the payload.
- **Create smart reminders** turns task deadlines, exam countdowns (7/3/1 days) and the daily goal into reminders. Reminders sync to the laptop, which schedules the pushes.
- **Send to Calendar** exports `.ics` with 15-minute OS alarms — the fallback that needs no server at all.

## Preview with sample data

Open `http://127.0.0.1:8788/?demo=1` once. It fills an empty library with five courses, chapters, tasks, exams and a 5-day focus streak so every screen is populated. It never overwrites existing data, and only runs while `?demo=1` is in the URL.

## Where your data lives

- **On each device:** IndexedDB database `meridian` in the browser. The app works fully offline.
- **On the laptop:** `data/meridian.sqlite` — the sync server's copy.
- **Pairing token:** `data/server.json` (keep private; it only grants access to your local sync).
- **Certificates and private keys:** `certs/` (gitignored).

Export a full JSON backup any time from **Settings → Your data**. Import merges by record ID, newest wins.

---

## Notes and limits

- The QR pairing link contains the token; treat it like a password.
- ICS import reads `VEVENT`s but does not expand recurring `RRULE`s. Export writes focus sessions as events.
- Focus sessions under one minute are not saved.
- `meridian.local` may not resolve on every Android browser — use the printed IP address.
- No accounts, no cloud, no telemetry. Everything stays on your devices.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run build` | Production build into `dist/` |
| `npm run check` | Typecheck + build |
| `npm run server` | Start sync server directly |
| `npm run cert:init` | Create local CA + certificate |
| `npm run cert:ip -- <ip>` | Re-issue certificate for a new IP (same CA) |
| `npm run icons` | Regenerate PWA icons |
