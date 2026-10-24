# SermonSight

**Church presentation + sermon scripture recognition that works fully offline**
by The Kreadive Galaxy

SermonSight gives an operator a live presentation output for the congregation while it
listens to the sermon, proposes scripture references as *matches*, and — only after an
explicit human click — loads them into preview/live. Everything that matters runs
locally: no internet, no cloud account, no AI auto-publish.

## Hard rules

1. The laptop is the primary device. The phone is a remote control only — never a second screen.
2. The live engine works fully offline. Firebase is optional and never required.
3. AI/speech recognition never publishes to the audience. A human confirms every passage.
4. Manual scripture search is always available, even when speech recognition is unavailable.
5. Never fabricate scripture. If the database is missing or invalid, show the error dialog.
6. Sunday reliability over features.

## Getting started

```powershell
npm install            # or: bun install
npm run dev            # launches the operator window (electron-vite dev)
npm run build          # production bundles into out/
npm run typecheck      # tsc for renderer + main
npm run rebuild        # rebuild better-sqlite3 against Electron
```

## Scripture database (`sermonsight.ss`)

The app reads the real SQLite database at:

- `assets/sermonsight.ss` (default, next to the app), or
- a path chosen in **Settings → Scripture database** (persisted).

The file is opened **read-only** (`readonly` + `PRAGMA query_only`) — SermonSight never
writes to scripture and never creates `sermonsight.ss-wal` / `sermonsight.ss-shm` at runtime.
Application state lives in `settings.json` under the user-data folder, never in the Bible file.

If the file is missing or fails validation, a full-screen **Scripture database error**
dialog explains where to put it. Search/presentation stay disabled until a valid database
loads — no placeholder scripture is ever shown.

Expected schema (probed at load time, tolerant of optional tables):
`metadata`, `translations`, `books`, `chapters`, `verses`, `aliases`, `search_index`,
`validation_results` — see `schema.sql` in the database project. Canonical verse IDs use
OSIS codes, e.g. `JHN.3.16`.

All translation layers present in the installed database are supported; verses are
loaded per whatever the installed database contains. Translations without text are listed as
*Not in database* and never block the UI. The public installer ships public-domain English
translations only; licensed texts (NIV, NLT, NKJV, …) can be added locally and are never
redistributed.

## Speech recognition (offline)

- Engine: [Vosk](https://alphacephei.com/vosk/) small English model, forked into a child
  process so heavy CPU never blocks the UI.
- Model folder: `models/vosk-model-small-en-us-0.15` (or `SERMONSIGHT_VOSK_MODEL` env var).
  Download `vosk-model-small-en-us-0.15.zip` from https://alphacephei.com/vosk/models and
  extract it there.
- `npm install vosk` installs the native runtime.
- Audio pipeline: microphone → AudioWorklet (100 ms frames) → energy/feature classification
  (silence/speech/music/mixed) → only speech frames are downsampled to 16 kHz PCM16 and fed
  to Vosk → transcripts → reference parser → ranked candidates.

If the model or the `vosk` package is missing, the app degrades gracefully: the status bar
shows *Speech: unavailable* and manual search still works.

## Operator workflow

| Key | Action |
| --- | --- |
| Single click | Preview a search result or voice match (never live) |
| Double click | Send a search result or voice match to the live output |
| `Enter` | Send active match live (or present preview if none) |
| `Esc` | Dismiss active match (or unblack) |
| `↑` `↓` | Move through matches |
| `Space` | Advance live passage / present preview |
| `B` | Toggle black screen |
| `Ctrl+K` | Focus the search box |

Screens: **Control Room** (preview/live stages), **Sermon**
(listen toggle, input meter, recognition test tool), **Settings**. Search and voice
matches live in the right rail; output controls stay in the far-left rail.

The presentation window is separate (`Open output`), targets an external display when
attached, and shows only confirmed scripture — never transcripts or confidence scores.

## Phone remote (optional)

Settings → Phone remote starts a LAN-only HTTP+WS server (private IPv4 only, never the
internet). Scan the QR code or open the printed URL on the phone, enter the 4-digit pairing
code (10-minute TTL), and you get big CONFIRM / REJECT / PREV / NEXT / BLACK buttons.
No pairing → no control. The app is fully usable with the remote switched off.

## Cloud account (optional)

`resources/firebase-config.json` is absent by default → the account layer stays disabled and
nothing in the app requires it.

## Logs

Rotating daily logs under `%APPDATA%/SermonSight/logs/sermonsight-YYYY-MM-DD.log`
(level configurable in Settings).

## Layout

```
assets/                  sermonsight.ss goes here (not in git)
models/                  vosk model folder
resources/remote/        phone remote page served over LAN
src/core/                pure logic: canon, database probe/repository,
                         reference parsing, confidence, VAD/classifier, themes
src/main/                Electron main: windows, IPC, database service,
                         presentation controller, recognition service,
                         STT host (child process), local server, settings
src/preload/             contextBridge API (whitelisted channels)
src/renderer/            React operator UI + presentation screen
src/shared/ipc.ts        the single IPC contract
```

## Tests against the real database

Acceptance checks (run with the real `sermonsight.ss` in place):

- Loads read-only; `PRAGMA integrity_check` = ok; no `-wal`/`-shm` created while running.
- Exact reference: Genesis 1:1, John 3:16, Romans 8:28, Psalm 23:1, 1 Corinthians 13:4,
  Revelation 22:21 — per available translation.
- Chapter search (`John 3`), keyword search (`shepherd`), phrase search
  (`for God so loved`), translation switching, preview → present → advance → black.
- Speech: say “turn with me to John chapter three verse sixteen” → match appears →
  double click sends it to the output window.
