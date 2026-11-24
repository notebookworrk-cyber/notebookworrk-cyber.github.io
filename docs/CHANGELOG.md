# Changelog

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
