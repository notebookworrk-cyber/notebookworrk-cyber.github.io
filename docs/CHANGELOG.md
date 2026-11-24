# Changelog

## 3.0.0 — the binder

- Rebuilt the shell as a physical binder: the desktop rail is a spine, the page has a stacked edge and a ribbon, and section tabs protrude above the sheet. Paper holds content; chrome uses a liquid-glass material with rim, pointer-following specular highlight and grain.
- Three glass tiers (Full / Balanced / Performance) plus reduced-motion and reduced-transparency paths. Glass is limited to fixed chrome and never used on scrolling lists.
- Rebuilt Today's front door around one number — the **deficit** (usable hours before the next exam against the hours your chapters estimate) — and one recommended move. Added the same line to Progress.
- Added **Notes** (`/notes`): pages with Markdown toolbar, instant search, course and chapter links, pin, tags and text export; PDF/image/text import; pen, highlighter, eraser and undo on a normalised ink layer; browser dictation; and "send selection to Review" as a 5-minute recall task.
- Added Dexie v4 (`notes`, `files`). Imported blobs live in IndexedDB and are deliberately excluded from JSON backups and sync; notes and ink are included.
- Added `pdfjs-dist` as the first new runtime dependency, lazy-loaded only in Notes. PDF rendering and ink capture are verified by `npm run check:pdf`.
- Rebuilt Settings as grouped, searchable navigation with a live appearance preview and a "Designed & built by Lucky" About card. Added author metadata to the manifest, page and package.
- Added 4 unit tests for the deficit (34 total) and extended browser checks to the Notes route and a note-creation journey.

## 2.0.0

- Rebuilt navigation: Today is the front door; Instrument, Plan, Review, Progress, Settings, Focus Studio and Shield are distinct surfaces. Desktop rail and mobile dock with the dial at the centre.
- Added Dexie v3: `recalls`, `commitments`, chapter intelligence fields, chapter-linked sessions, generated task provenance.
- Added versioned backup v2 with validation before write, transactional merge/replace, and legacy v1 import.
- Added an explainable scheduler with fixed commitments, capacity limits, breaks and subject distribution.
- Added Rescue My Day with kept/moved/deferred diff and explicit acceptance.
- Added Recall Loop with four ratings, a 1/3/7/14/30-day ladder and an evidence-based review queue.
- Added Focus Studio with responsive layouts, notes, wake lock, keyboard shortcuts and optional reflection.
- Added procedural Audio Studio generated with Web Audio; no external audio assets or accounts.
- Rebuilt Progress with readiness evidence, study/learning analytics, flight recorder and an updated Statement.
- Added Paper / Graphite / System themes, accent choice, glass/density/motion profiles and persisted preferences.
- Added a command palette (Ctrl/Cmd+K), quick capture, update-ready prompt and offline indicator.
- Fixed break sessions inflating focus stats, drifting session start times, duplicate session saves and multi-day suspension banking.
- Hardened the LAN server: local-only CORS, rate limiting, smaller request cap, constant-time pairing token and privacy headers.
- Added a Vitest suite (30 tests) and a Playwright-core browser check using the installed system Chrome.
