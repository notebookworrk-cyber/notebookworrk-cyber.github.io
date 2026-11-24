# Architecture

Meridian stays deliberately small: React 19 + TypeScript + Vite 7, Dexie 4 / IndexedDB, Zustand, React Router, Tailwind 4 and vite-plugin-pwa. No UI framework, no tracking, no runtime service.

## Feature boundaries

```
src/
  app/        shell, navigation, theme/preferences, icons, shared UI, command palette
  db/         Dexie schema v1→v3, hooks, backup v2, record types
  lib/        pure logic: scheduler, recall, readiness, estimate, stats, dates, ICS, cost
  features/
    today/    next best move, day sheet, quick capture
    instrument/  dial + chapter rack + session controls
    focus/    timer store, Focus Studio, wake lock, recovery dialog
    audio/    procedural Web Audio engine + glass player
    plan/     week, backlog, courses, fixed commitments, rebuild, rescue
    review/   revision queue and active-recall flow
    progress/ readiness evidence, analytics, grade what-if, statement
    settings/ profile, appearance, timer, notifications, privacy, data, devices
    block/    Focus Shield
    reminders/, ledger/, reset/  supporting modules
  sync/       optional LAN pairing and sync
```

## Data model

Dexie v1/v2 records are preserved. v3 adds `recalls` and `commitments` plus optional fields on `Topic`, `Session` and `Task`. Optional fields default at read time so old records are never fabricated into "history".

- `Topic`: `estimateMin`, `note`, `lastStudiedAt`, `lastRecallAt`, `nextReviewAt`, `reviewInterval`, `recallCount`, `lapses`.
- `Session`: `topicId`, `plannedMin`, `completed`, `difficulty`, `confidenceAfter`, and a true `firstStartedAt`-based start time.
- `Task`: `topicId`, `source`, `planId` — generated blocks can be replaced without touching manual work.
- `Recall`: one rating + method + answer + computed next due date. The only source of revision scheduling truth.
- `Commitment`: weekly fixed block; a hard barrier in the scheduler.

`TABLES` in `src/db/db.ts` and the allowlist in `server/index.mjs` must stay in sync.

## Key invariants

1. **Breaks never count as focus.** Every stats path filters `mode !== 'break'`.
2. **One session, one write.** `stopAndSave` and timer completion share a guarded commit promise.
3. **Elapsed time uses timestamps.** `startedAt` is the first real start, so pauses do not move blocks on the timeline.
4. **Long suspension is a question, not an answer.** `reconcile()` pauses and asks the user to keep or discard capped minutes.
5. **Backup writes are atomic.** All rows are validated before a transaction clears or merges anything.
6. **Generated schedules are replaceable.** Rebuild/rescue tasks carry a `source`, so applying a new plan only removes that plan's own blocks.
7. **Fixed commitments are preserved** by both rebuild and rescue.

## Performance

Screens are lazy-loaded. Visual transitions are CSS transform/opacity only. The clock is one shared 1-second interval. The audio engine uses looping generated buffers and audio-node modulation rather than React state. Three glass profiles (Full / Balanced / Performance) are selected from capability signals with a manual override; reduced motion is honoured at the root.

## Deployment

`.github/workflows/pages.yml` builds on push to `main` and publishes `dist/`. `scripts/postbuild.mjs` copies `index.html` to `404.html` so direct routes survive a static-host refresh.
