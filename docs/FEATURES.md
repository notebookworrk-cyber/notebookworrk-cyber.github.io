# Feature reference

## The binder and the line

The app is a binder: a spine on desktop, section tabs above a stacked page, a ribbon on today's page. Liquid glass is a material for fixed chrome — top bar, dock, sheets, palette, audio panel — never for lists. Full / Balanced / Performance profiles, reduced motion and reduced transparency all have real paths.

Today opens with the **deficit**: usable hours before the nearest exam (your hours-per-day setting, capped by the actual free windows after fixed commitments today) minus the hours your unfinished chapter estimates require. The number is labelled with its evidence quality and assumptions. It is a prompt to decide, not a grade. Progress shows the same line beside the readiness band.

## Notes

Pages can be typed (small Markdown toolbar: bold, italic, heading, list, quote), dictated through the browser's speech service, or created by importing a file. PDF, images, TXT and MD render inline; DOCX/PPTX and other formats are stored and can be opened in another app. Pen, highlighter, eraser, four ink colours, width and clear/undo operate on a normalised coordinate layer, so strokes stay put through zoom and reload. Search covers title, text and tags. Select text and **Send selection to Review** creates a 5-minute recall task for tomorrow tied to the page's chapter.

Files live in the `files` table as Blobs and are not part of JSON backups or LAN sync; notes and ink are. Dictation audio goes to the browser's speech service, never through Meridian, and the mic control is hidden where the API is unavailable.

## Rescue My Day

Available from Today and Plan. It keeps completed sessions and fixed commitments, computes the minutes actually left after now, and rebuilds only today's work. The dialog shows three lists: **Kept**, **Moved** (original time → new time + reason), and **Deferred** (untouched, with the reason it did not fit). Accepting applies the recovery plan; rejecting leaves the original plan exactly as it was.

The scheduler's score is transparent: confidence gap, exam proximity and weight, revision due, task deadline and user priority. Capacity is hours-per-day × intensity, further capped by real free windows after commitments, meals and the current time. Long tasks are split into 25/50-minute blocks with a short break between them.

## Recall Loop

Review shows due, overdue, upcoming, weak and never-recalled chapters, ranked by real recall and exam data. A recall attempt records method, optional answer, a four-level rating, confidence change and a next due date. Ratings move along 1/3/7/14/30 days: Easy steps out, Effort holds, Hard steps back, Lost returns to one day. The ladder is a starting point, not a memory guarantee.

## The Instrument

The dial keeps five-minute detents (5–90 min), pointer capture, keyboard control, tick and haptics. Selection assigns a chapter to the session. While running the dial re-times; holding banks the minutes. A completion or bank produces one saved session with chapter, planned duration, notes and optional reflection. Long suspensions open a recovery dialog instead of silently saving hours.

## Focus Studio + Audio Studio

Portrait, landscape and desktop are real responsive grids, not fixed screenshots. Space starts/pauses, `N` focuses notes, Escape leaves immersive mode. Wake lock is optional and capability-gated. Finish offers a ten-second reflection that is always skippable.

Audio is generated locally: filtered noise for rain/wind/ocean, a pre-rendered crackle buffer for fire, and white/pink/brown beds. Controls cover volume, mute, presets, a sleep timer and Media Session metadata. No audio files, accounts or streaming.

## Progress

- **Readiness:** range plus evidence table (chapters, scores, recent study, recall) and missing-data labels. Never presented as an exam prediction.
- **Patterns:** daily/weekly/monthly focus, 28-day consistency, subject distribution, heat strip, chapter/task completion, recall balance.
- **Flight recorder:** estimated versus actual minutes per chapter from real sessions, with an honest note about underestimating or overestimating.
- **Grades:** what-if sliders for ungraded assessments, clearly labelled hypothetical.
- **Statement:** a locally generated 1080×1920 PNG. Includes only aggregate counts — no notes, tokens or private records.

## Privacy

No ads, analytics, tracking pixels, mandatory accounts or cloud dependency. Core study features work offline. LAN sync is opt-in and local; pairing credentials stay in `data/` and are excluded from backups. Server responses send `no-store`, `Referrer-Policy: no-referrer` and local-only CORS. Push payloads contain no study data.
