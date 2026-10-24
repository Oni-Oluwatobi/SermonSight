# SermonSight — Complete Project Documentation

**Product:** SermonSight — offline church presentation + sermon scripture recognition
**Author / publisher:** The Kreadive Galaxy
**Version documented:** 0.2.0 (installer built 2026-10-10)
**Platform:** Windows x64 (Electron desktop app)
**Repository:** `https://github.com/Oni-Oluwatobi/SermonSight.git` (see §16 for repository state)

---

## Table of contents

1. [What SermonSight is](#1-what-sermonsight-is)
2. [Product hard rules](#2-product-hard-rules)
3. [Technology stack](#3-technology-stack)
4. [Repository structure (complete)](#4-repository-structure-complete)
5. [Process architecture & data flow](#5-process-architecture--data-flow)
6. [The Scripture database (`sermonsight.ss`)](#6-the-scripture-database-sermonsights)
7. [Speech recognition pipeline (offline)](#7-speech-recognition-pipeline-offline)
8. [Recognition intelligence (parser → matcher → scorer → candidates)](#8-recognition-intelligence)
9. [Presentation system](#9-presentation-system)
10. [Operator UI (renderer)](#10-operator-ui-renderer)
11. [Phone remote (LAN control)](#11-phone-remote-lan-control)
12. [Cloud account / Firebase (optional)](#12-cloud-account-firebase-optional)
13. [EasyWorship integration (optional)](#13-easyworship-integration-optional)
14. [State management, IPC contract, settings, logging](#14-state-management-ipc-contract-settings-logging)
15. [Build, packaging & installer](#15-build-packaging--installer)
16. [Testing & verification](#16-testing--verification)
17. [Project work history (this build cycle)](#17-project-work-history-this-build-cycle)
18. [Data inventory on the development machine](#18-data-inventory-on-the-development-machine)
19. [Known limitations & outstanding items](#19-known-limitations--outstanding-items)
20. [Operator quick reference](#20-operator-quick-reference)

---

## 1. What SermonSight is

SermonSight is a Windows desktop application for church media operators. It combines two jobs in one offline tool:

1. **Church presentation engine** — a Control Room where the operator previews scripture and pushes it to a separate presentation output window (typically a second display / projector). The congregation sees only confirmed scripture: never transcripts, never confidence scores, never candidates.

2. **Sermon scripture recognition** — while the pastor preaches, the operator can turn on the microphone. The app listens **fully offline** (Vosk speech recognition, no cloud), parses what was said into scripture references and quote candidates, and displays them as *matches* in a right-hand panel. A human must always confirm before anything reaches the audience. Detected matches go to **preview first**; the operator then presents them live.

The design philosophy is "Sunday reliability over features": everything that matters (presentation, search, speech recognition) runs locally on the laptop with no internet, no cloud account, and no AI auto-publishing. Firebase authentication and the phone remote are optional add-ons that the app works completely without.

### Typical Sunday flow

1. Open SermonSight → sign in once (session persists; app opens offline afterwards).
2. **Open output** (presentation window) and place it on the projector display.
3. Pre-load sermon scriptures via **Scripture Search** (Ctrl+K) → Preview → Present.
4. During the sermon, start the **microphone** on the Sermon screen when desired.
5. As the pastor speaks ("turn with me to John 3:16"), candidates appear in the right panel with confidence scores.
6. Single click a candidate → loads into **preview** (operator-only). Double click / Confirm + Present → congregation sees it.
7. Use Space/arrow keys to page through long passages; B to black the screen between points.

---

## 2. Product hard rules

These rules are encoded throughout the architecture (and stated in `README.md`):

1. **The laptop is the primary device.** The phone is a remote control only — never a second screen.
2. **The live engine works fully offline.** Firebase is optional and never required.
3. **AI/speech recognition never publishes to the audience.** A human confirms every passage.
4. **Manual scripture search is always available**, even when speech recognition is unavailable.
5. **Never fabricate scripture.** If the database is missing or invalid, a full-screen error dialog explains the problem; placeholder verses are never shown.
6. **Sunday reliability over features.** Failures degrade to honest status messages; the app never crashes (main process installs `uncaughtException`/`unhandledRejection` handlers that only log).

---

## 3. Technology stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33 (x64), single-instance lock, separate presentation BrowserWindow |
| Build tooling | electron-vite 2 (Vite 5) — three bundles: main, preload, renderer |
| UI | React 18 + TypeScript 5.7, plain CSS (`app.css`, dark professional theme) |
| Scripture storage | SQLite via **better-sqlite3** (native, opened **read-only**), worker-process search |
| Speech recognition | **Vosk** (small English model `vosk-model-small-en-us-0.15`), forked child process, loaded via **koffi**/vosk native lib |
| Audio capture | AudioWorklet (100 ms frames) in the renderer → feature classification → 16 kHz PCM16 to main |
| Phone remote | Node `http` + `ws` WebSocket server, QRCode generation, PIN pairing |
| Cloud auth (optional) | Firebase JS SDK (Email/Password), browser persistence (IndexedDB) |
| Packaging | electron-builder → NSIS installer (`SermonSight-Setup-<version>.exe`) |
| Tests | Standalone CDP (Chrome DevTools Protocol) e2e scripts run with system Node — no Jest/Vitest |
| DB tooling | Node scripts for validation; **Python 3 `sqlite3`** for large DB transforms (system Node cannot load the Electron-built better-sqlite3 binary) |

Node on the dev machine: v24.1.0. Python: 3.13. Windows PowerShell 5.1.

---

## 4. Repository structure (complete)

```
SermonSight/
├─ package.json                  # scripts, deps, version (0.2.0)
├─ electron-builder.yml          # NSIS packaging config (public-DB extraResources)
├─ tsconfig.web.json             # renderer typecheck
├─ tsconfig.node.json            # main/preload typecheck
├─ README.md                     # product readme (offline-first rules, layout, tests)
├─ PROJECT-DOCUMENTATION.md      # this file
│
├─ assets/
│  ├─ sermonsight.ss             # MASTER database, 20 translations (local use only, 198.9 MB) — not shipped
│  ├─ sermonsight-public.ss      # PUBLIC database, 20 public-domain translations (shipped, 198,852,608 B)
│  ├─ public-db-report.json      # build report: SHA-256s, kept/dropped translations, integrity
│  └─ *.bak-*                    # DB backups taken before import/slimming (see §18)
│
├─ models/
│  └─ vosk-model-small-en-us-0.15/   # Vosk offline model (packaged into installer)
│
├─ vendor/
│  └─ vosk/                     # Vosk native runtime (DLLs) for Windows x64
│
├─ resources/
│  ├─ firebase-config.json      # Firebase web config (present on dev machine; gate uses it)
│  └─ remote/
│     └─ index.html             # self-contained phone remote web page (served over LAN)
│
├─ src/
│  ├─ shared/
│  │  └─ ipc.ts                 # THE single IPC contract: all cross-process types + channel names
│  │
│  ├─ core/                     # pure logic, no Electron imports (shared by main + workers)
│  │  ├─ canon/books.ts         # 66-book canon, OSIS codes, name matching
│  │  ├─ database/
│  │  │  ├─ schema.ts           # expected SQLite schema descriptors
│  │  │  ├─ DatabaseValidator.ts# load-time validation (integrity, required tables)
│  │  │  └─ ScriptureRepository.ts # read-only queries: passages, search, translations
│  │  ├─ recognition/
│  │  │  ├─ ReferenceParser.ts  # deterministic spoken/written reference parser (no LLM)
│  │  │  ├─ ScriptureMatcher.ts # candidate drafts: exact refs, snippets, exclusions
│  │  │  ├─ ConfidenceScorer.ts # phrase scoring, significant tokens
│  │  │  └─ CandidateEngine.ts  # builds final Candidate list (cap 5, TTL 5 min)
│  │  ├─ presentation/themes.ts # classic / minimal / dark output themes
│  │  └─ audio/
│  │     ├─ features.ts         # RMS/dB, ZCR, spectral centroid, flatness, FFT
│  │     ├─ VoiceActivityDetector.ts # adaptive noise floor, onset/hangover
│  │     └─ AudioClassifier.ts  # silence/speech/music/mixed classification
│  │
│  ├─ main/                     # Electron main process
│  │  ├─ index.ts               # startup: settings → logger → IPC → STT events → DB load → windows
│  │  ├─ state.ts               # central AppState store + patch/broadcast
│  │  ├─ ipc.ts                 # all ipcMain handlers (~348 lines), remote start, shutdown
│  │  ├─ windows.ts             # operator + presentation window creation, state broadcast
│  │  ├─ settings.ts            # settings.json load/save under userData
│  │  ├─ logger.ts              # daily rotating logs under %APPDATA%/SermonSight/logs
│  │  ├─ database/
│  │  │  ├─ DatabaseService.ts  # opens DB read-only, validation, reload/choose
│  │  │  ├─ SearchService.ts    # spawns/warms searchWorker child process
│  │  │  └─ searchWorker.ts     # child process: all LIKE/queries off the main thread
│  │  ├─ recognition/
│  │  │  └─ RecognitionService.ts # partial/final transcripts → search → candidates → preview
│  │  ├─ stt/
│  │  │  ├─ SttHost.ts          # forks sttWorker, lifecycle, load queue, crash recovery
│  │  │  ├─ sttWorker.ts        # child process: Vosk model load + acceptWaveform
│  │  │  ├─ SpeechToTextEngine.ts # SttEvent types / engine interface
│  │  │  └─ voskLib.ts          # native lib resolution (vendor/vosk vs packaged)
│  │  ├─ presentation/
│  │  │  └─ PresentationController.ts # preview/live/black/next/prev/pagination
│  │  ├─ remote/
│  │  │  ├─ LocalServer.ts      # LAN HTTP+WS server, QR, private-IPv4 binding
│  │  │  └─ PairingManager.ts   # 4-digit PIN, 10-minute TTL
│  │  ├─ account/
│  │  │  └─ AccountProvider.ts  # local device registration (userData files)
│  │  └─ integration/
│  │     └─ EasyWorship.ts      # detect installs + clipboard hand-off (free methods only)
│  │
│  ├─ preload/
│  │  └─ index.ts               # contextBridge: window.api {invoke, send, on} (whitelisted IPC)
│  │
│  └─ renderer/src/
│     ├─ main.tsx               # entry: initAuth() + initStore() + React root (StrictMode)
│     ├─ App.tsx                # App → (presentation? PresentationScreen : GatedApp)
│     │                         # GatedApp: loading spinner → LoginScreen | OperatorApp
│     │                         # OperatorApp: TitleBar, Sidebar, screen router + modals,
│     │                         #   StatusBar, DatabaseErrorOverlay, toasts, keyboard shortcuts
│     ├─ env.d.ts               # window.api typings
│     ├─ styles/app.css         # TKG token system (dark default + [data-theme=light]), grid: 220px | 1fr
│     ├─ auth/firebaseAuth.ts   # Firebase init, sign-in/up/reset/out, 10s restore bail-out
│     ├─ audio/AudioInput.ts    # getUserMedia → AudioWorklet → classifier → PCM to main;
│     │                         #   VAD pre-roll buffer (5×100 ms) so onset never clips speech
│     ├─ state/store.ts         # renderer store: useAppState/useAuth/useToast/useAudioStatus,
│     │                         #   actions.* (IPC wrappers), showToast, candidateText
│     ├─ screens/
│     │  ├─ LoginScreen.tsx     # sign-in / create account / reset password (Firebase)
│     │  ├─ HubScreen.tsx       # welcome CTAs + Recent Sessions (rename/clear/open-last)
│     │  ├─ ControlRoomScreen.tsx # 3-column room: mic card (waveform, state banner, quick
│     │  │                      #   keys, diagnostics injection), live pane + transport
│     │  ├─ PresentationsScreen.tsx # theme cards, font size, display, output controls
│     │  └─ PresentationScreen.tsx # OUTPUT window renderer (themes, paging, black,
│     │                             #   SermonSight / The Kreadive Galaxy watermarks)
│     └─ components/
│        ├─ TitleBar.tsx        # frameless window bar: brand, Offline Mode pill, min/max/close
│        ├─ Sidebar.tsx         # 220px nav (Hub/Control Room/Presentations/Search/Settings)
│        ├─ CandidateSection.tsx # recognition table + inline search tabs, Preview/Confirm/Reject
│        ├─ ScriptureSearch.tsx # shared search body (Search modal + candidate section)
│        ├─ modals/             # ModalShell, SearchModal, SettingsModal (rail), PairingModal
│        ├─ StatusBar.tsx       # bottom bar: DB/speech/mic/remote/live status + Black toggle
│        └─ DatabaseErrorOverlay.tsx # full-screen DB missing/invalid dialog
│
├─ tools/                       # developer utilities
│  ├─ build_public_db.py        # builds sermonsight-public.ss from the master DB (Python)
│  ├─ validate-db.js            # quick DB integrity/verse checks
│  ├─ stt-smoke.js              # STT worker smoke test
│  ├─ vosk-probe.js / vosk-koffi-smoke.js / dlopen-probe.js  # native lib diagnostics
│  ├─ ref-probe.js              # ReferenceParser probing
│  ├─ db-check-118.js           # spot checks (e.g. Psalm 118 pagination verse counts)
│  ├─ tts.ps1                   # Windows SAPI TTS → WAV (used to feed e2e speech tests)
│  └─ dbg.js                    # misc debug helper
│
├─ tests/                       # standalone e2e/probes (system node, CDP over port)
│  ├─ e2e-auth-display-stt.js   # 32-check suite: auth gate → display → STT states → restart
│  ├─ e2e-streaming-remote.js   # streaming + phone-remote suite
│  └─ probe-*.js / repro-fill.js # targeted diagnostics (workers, display, STT)
│
├─ .tmp-bibles/                 # translation import workspace (import scripts + reports) — local only
├─ dist/                        # electron-builder output (win-unpacked + installer) — regenerated
└─ out/                         # electron-vite production bundles (main/preload/renderer)
```

---

## 5. Process architecture & data flow

SermonSight runs up to **six OS processes**:

```
┌────────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (out/main/index.js)                                   │
│  ├─ AppState store + broadcaster (state.ts)                        │
│  ├─ IPC handlers (ipc.ts)                                          │
│  ├─ DatabaseService → ScriptureRepository (better-sqlite3, RO)     │
│  ├─ PresentationController (preview/live/black/page)               │
│  ├─ RecognitionService (transcripts → candidates)                  │
│  ├─ SttHost ──────── forks ────────► STT WORKER (sttWorker.js)     │
│  ├─ SearchService ── forks ────────► SEARCH WORKER (searchWorker.js)│
│  ├─ LocalServer (HTTP + WS on LAN, optional)                       │
│  └─ Windows: operator window + presentation window                 │
└──────────────┬──────────────────────────────┬──────────────────────┘
               │ contextBridge (preload)      │ HTTP/WS (LAN phones)
┌──────────────▼──────────────┐  ┌────────────▼─────────────────────┐
│ OPERATOR RENDERER           │  │ PHONE REMOTE BROWSER PAGE        │
│ React UI (TitleBar, Sidebar,│  │ resources/remote/index.html      │
│ Control Room, Hub, Present- │  │ PIN-paired Home / Slides / Bible │
│ ations, Search & Settings   │  │ Search / Media / Settings views  │
│ modals, StatusBar)          │  │ + live state sync + RPC          │
└──────────────┬──────────────┘  └──────────────────────────────────┘
               │ AudioStreamMessage (features + PCM frames)
               ▼
        (audio flows renderer → main → STT worker)
```

### Startup sequence (main/index.ts)

1. `app.requestSingleInstanceLock()` — second launches focus the existing window.
2. `loadSettings()` from `%APPDATA%/SermonSight/settings.json`; `initLogger(logLevel)`.
3. `registerIpcHandlers()`.
4. Wire `sttHost.onEvent` → status patches + `handlePartialTranscript` / `handleFinalTranscript`.
5. `databaseService.reload()` — startup integrity checks only (no full scans); on success `searchService.warm()` pre-spawns the search worker.
6. Seed AppState (db status, translation, presentation meta incl. page/pageCount).
7. Broadcaster: every state patch → operator window + presentation window + phone remote.
8. `accountProvider.registerDevice()` (local device identity files in userData).
9. `createOperatorWindow()`; start the phone remote if `settings.remoteEnabled`.
10. `before-quit` → `shutdownSubsystems()` (kill workers, close server, flush logs).

### State flow rule

All UI-affecting mutations go through `patch()` in main `state.ts`. The renderer never mutates shared state locally; it calls `actions.*` → IPC → main patches → broadcast → React re-renders via `window.api.on(STATE_UPDATE)`.

---

## 6. The Scripture database (`sermonsight.ss`)

### Physical format

A SQLite database file with extension `.ss`. Opened **read-only** (`readonly: true` + `PRAGMA query_only=ON`) — SermonSight never writes scripture and never creates `-wal`/`-shm` sidecar files at runtime. App settings live separately in `settings.json`.

### Schema (probed at load, tolerant of optional tables)

- `metadata` — schema version, database version, canonical marker
- `translations` — abbreviation, name, language, license_status, text_status, copyright fields
- `books`, `chapters`, `verses` — verse text keyed by **OSIS canonical IDs** (e.g. `JHN.3.16`)
- `aliases` — alternate book names / spoken aliases
- `search_index` — optional; **emptied in the master DB** (app search uses `v.text LIKE ?` on `verses`)
- `validation_results` — per-verse validation statuses surfaced in `VerseView.validationStatus`

### Validation & failure behavior

`DatabaseValidator` runs at load. Outcomes → `DbStatus.state`:

- `loaded` — all good; translations listed with `available` flags
- `missing` / `invalid` — full-screen `DatabaseErrorOverlay` with the exact path and remedy; search/presentation disabled; **no placeholder scripture ever shown**

### Two database artifacts (licensing)

| Artifact | Translations | Size | Ships? |
| --- | --- | --- | --- |
| `assets/sermonsight.ss` (master) | 20 public-domain + NLT + NKJV (local-only) | 198,852,608 B | **No** |
| `assets/sermonsight-public.ss` | 20 public-domain English | 198,852,608 B | **Yes** → installed as `resources/assets/sermonsight.ss` |

Public (shipped) translations — 20 total, 595,252 verses:

`AKJV, ASV, BRE, BSB, COV, DAR, DRB, GNV, HNV, HRV, KJV, MTB, RNKJV, ROT, RV, TYN, WBS, WEB, WYC, YLT`

Deliberately **excluded** from the public installer:

- **NIV** — placeholder row only (0 verses), licensed, never redistributed
- **NLT** — full text imported from a user-supplied PDF, local-only, never redistributed
- **NKJV** — full text from repo `sajeevavahini/bibles`, copyrighted, `imported-local-only`
- **MSG** — placeholder row only (0 verses)

The public DB is produced by `tools/build_public_db.py` (`npm run db:public`): copies the master DB, deletes the four excluded translations' rows/verses (62,205 verses removed), runs `PRAGMA integrity_check` (ok), writes `assets/public-db-report.json` with SHA-256 of source and output. The installer maps it via electron-builder `extraResources` (`assets/sermonsight-public.ss` → `assets/sermonsight.ss`), so the licensed texts never leave the machine.

Historical note: the DB was slimmed 2026-10-10 from 682.7 MB → 209.4 MB (search_index emptied, indexes dropped, VACUUM; app search verified unaffected), then the public variant was cut down to 198.9 MB. Repository import history: 595,252 verses imported from `sajeevavahini/bibles` with zero FK violations; three on-disk copies (assets/, project root, dist) exist on the dev machine and are hash-identical to the master.

---

## 7. Speech recognition pipeline (offline)

End-to-end audio path (all local; nothing leaves the machine):

```
Microphone
  → getUserMedia (renderer)
  → AudioWorklet "ss-capture" (100 ms Float32 frames)
  → AudioClassifier (VAD + spectral features)
       silence ──► dropped
       music   ──► dropped (worship music must not feed STT)
       speech/mixed ──► downsample 48k→16k PCM16
  → window.api.send(AUDIO_STREAM, frames)  [renderer → main]
  → SttHost (main)
       while model loads: hold in loadQueue (cap 10 s; replaying longer backlogs garbles text)
  → sttWorker (forked child process)
       Vosk model vosk-model-small-en-us-0.15
       acceptWaveform() → partial + final transcripts
  → RecognitionService (main)
       parse → match → score → candidates → optional preview
```

### Key components

- **AudioClassifier / VoiceActivityDetector** (`src/core/audio/`): adaptive noise floor, onset/hangover smoothing; spectral centroid + flatness detect sustained instrumental "music" context so worship music pauses recognition (`AudioClassifier.feedsStt` only passes `speech`/`mixed`).
- **Pre-roll buffer** (`AudioInput.ts`): keeps the last 5 frames (~500 ms) of non-speech PCM and prepends them when speech starts, so the VAD onset never clips the first word of a reference.
- **SttHost** (`src/main/stt/SttHost.ts`): owns the worker child process. States: `unavailable → starting → listening → paused → error`. Features: audio held during model load (max 10 s), `pauseRequested` re-asserted if the operator stops the mic mid-load, **automatic crash recovery** — worker `uncaughtException` exits the child, host restarts with bounded backoff (1 s / 2 s / 4 s, max 3 attempts), then surfaces an honest error state. Auto-flush timer (1.1 s of silence finalizes the utterance).
- **sttWorker** (`src/main/stt/sttWorker.ts`): the only process that touches the Vosk native library; caps queued chunks (100 ≈ 10 s) to bound memory.
- **Model resolution**: `SERMONSIGHT_VOSK_MODEL` env override → packaged `resources/models/…` → dev `models/…`. Missing model ⇒ state `unavailable` with an actionable message (exact download URL and target path) — never a silent failure. Manual search still works.

### Honesty guarantees

- The Sermon screen banner always reflects true engine state (`listening`, `paused — resuming…`, `model not installed`, etc.).
- The recognition **test tool** on the Sermon screen injects typed text through the exact same pipeline (`IPC.TRANSCRIPT`) so the confirm workflow can be rehearsed without audio.
- Mic off ⇒ `RecognitionService.cancelSpeechSearches()` bumps the latest-wins sequence, clears scheduled searches, and stops patching stale results; `sttHost.pause()` keeps the model warm for instant resume.

---

## 8. Recognition intelligence

Speech text becomes UI candidates through a deterministic (no LLM) pipeline in `src/core/recognition/` + `src/main/recognition/RecognitionService.ts`:

1. **ReferenceParser** — converts written AND spoken forms to canonical references:
   - `"John 3:16"`, `"John chapter three verse sixteen"`, `"first corinthians 13:4-7"`, `"psalm twenty three"`
   - Handles number words, ordinal book prefixes (1/2/3 Samuel…), ambiguous bare roots ("samuel", "corinthians"), verse ranges. Never produces references absent from the input text.
2. **ScriptureMatcher** — builds candidate drafts: exact chapter/verse hits, verse-range passages, and phrase/keyword hits with snippets drawn from actual DB text.
3. **ConfidenceScorer** — scores phrase matches on significant-token overlap; reference confidence is separate from phrase confidence.
4. **CandidateEngine** — finalizes `Candidate` objects (id, kind `reference|phrase`, canonicalId, reference, translation, text, confidence 0–1, snippet, detectedAt). Cap: **5 candidates**, TTL **5 minutes**.
5. **Streaming search scheduler** (RecognitionService) — partials AND finals flow through ONE pipeline with **no debounce**: first meaningful change searches immediately; identical queries deduplicated; one search at a time; **latest-wins sequence numbers** so a superseded search never touches the UI. Display-only partial patches rate-limited to ~3/s.
6. **Auto-preview** — the top candidate is pushed to **preview** (operator screen) when it changes; it is **never** auto-pushed live. Verses currently on the live output are excluded from new drafts so repeated mentions don't re-duplicate the stage.
7. **Human gate** — `IPC.CANDIDATE_CONFIRM` / `CANDIDATE_REJECT` / keyboard Enter/Esc / phone CONFIRM/REJECT are the only paths to live output.

---

## 9. Presentation system

`PresentationController` (main) owns `preview`, `live`, `black`, and pagination:

- **Preview** — operator-only. Sources: manual search, candidate confirm, keyboard. Never reaches the congregation.
- **Live** — what the output window shows. Only set via explicit Present/confirm.
- **Black** — hot-blackout of the output (key `B` / phone BLACK / StatusBar button). Unblack with Esc/B.
- **Pagination** — long passages (e.g. Psalm 118, 29 verses) are sliced into pages of visible verses (font-size dependent; ~3–6 verses/page observed). `PresentationMeta.page` / `pageCount` drive the `1 / 6` indicator. Space/`next`/`prev` step within the current passage first, then move to the adjacent passage (previous/next chapter-adjacent reference via the repository).
- **Resolution of references** — `referenceParser` + repository `getPassage`; clear errors when a translation lacks text or the reference can't be resolved ("No text found for X in KJV" / "KJV is not available in this database").
- **Output window** (`windows.ts` + `PresentationScreen.tsx`) — separate BrowserWindow (`?window=presentation`); can be moved to a chosen display (`PRESENTATION_SET_DISPLAY`), toggled fullscreen; shows only confirmed verse text + optional reference + translation badge per theme. Verse numbers render in the theme accent color.
- **Themes** (`src/core/presentation/themes.ts`): `classic`, `minimal`, `dark` — affect background, accent, font scale (`fontSizePct`), reference/badge visibility (`showReference`, `showTranslationBadge`).

---

## 10. Operator UI (renderer)

Layout (CSS grid `220px | 1fr`, rows `40px | 1fr | 30px` — owner-commissioned reconstruction):

```
┌──────────────────────────────────────────────────────────────┐
│ TITLEBAR  [K] SermonSight by The Kreadive Galaxy · subtitle  │
│           ● Offline Mode                      ─  ▢  ✕       │
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN (one screen at a time)                       │
│  ⌂ Hub   │  • Hub: welcome CTAs + Recent Sessions            │
│  ◎ Control  • Control Room (3-column room):                   │
│    Room  │     Microphone │ Recognition Results │ Live Output │
│  ▤ Present  • Presentations: theme cards, sizing, display    │
│    ations│  • Modals: Search (Ctrl+K) · Settings (rail:      │
│  ⌕ Search│     General/Presentation/Remote/Database/Account) │
│  ⚙ Settings  · Phone Remote Pairing (QR)                    │
│          ├───────────────────────────────────────────────────┤
│ lockup   │ STATUSBAR  DB · speech · mic · remote · live      │
└──────────┴───────────────────────────────────────────────────┘
```

- **Auth gate** (`GatedApp`): `loading` → "Restoring session…" card (10 s bail-out to the sign-in gate on dead networks — Firebase is optional, the app must never hang); `unauthenticated` → `LoginScreen`; else `OperatorApp`.
- **TitleBar** — frameless drag region with brand lockup, `● Offline Mode` identity pill, and window controls (minimize/maximize/close via `window:*` IPC).
- **Sidebar** — 220px navigation (Hub / Control Room / Presentations + Search/Settings modals); pending-candidate badge on Control Room; "LAN on" badge on Settings when the remote runs; brand lockup ("Empowering the World with Innovative AI").
- **Control Room** — 3-column room: **Microphone** (level waveform, state banner, Start/Stop, quick-key cards, diagnostics drawer with IPC.TRANSCRIPT injection), **Recognition Results** (tabbed table with confidence dots, detail strip, Reject/Preview/Confirm, inline search tab, "View all results →"), **Live Output** (mini stage, Present CTA, page-aware transport with Pause=black, output status).
- **StatusBar** — always-visible truth: DB filename/state, `Speech: <state>`, mic label, remote client count, transcript chip, live reference, quick Black/Unblack button.
- **Keyboard shortcuts** (OperatorApp): `Enter` confirm active candidate (or present preview), `Esc` reject active (or unblack), `↑`/`↓` cycle candidates, `Space` advance live / present preview, `B` black toggle, `Ctrl+K` toggle the Search modal (typing in inputs never triggers shortcuts; modal focus suppresses candidate shortcuts).
- **Toasts** — transient messages (sign-in results, mic errors, reset emails) via `showToast(message, tone, ttl)`.
- **DatabaseErrorOverlay** — modal blocker when the DB is missing/invalid, with "Choose file…" and "Try again".

---

## 11. Phone remote (LAN control)

Optional; the app is fully usable with it off.

- **LocalServer** (`src/main/remote/LocalServer.ts`) — Node `http` + `ws` bound strictly to the machine's **private IPv4** (10/192.168/172.16-31 only — never a public interface). Serves `resources/remote/index.html` and a WebSocket for live state + commands.
- **PairingManager** — 4-digit PIN with a **10-minute TTL**; no PIN ⇒ no control commands accepted. QR code (via `qrcode`) encodes the URL for instant phone pairing.
- **Phone page** — responsive single-file controller (sidebar ≥600px, bottom nav below): Home (Live Control card + transport where **Pause = black**, quick actions, mic status, recent activity, quick scripture, saved slides), Slides, Bible Search (tap preview / double-tap display), **Media (honest "not available in this build" state)**, and Settings; plus JSON-RPC-style ops (search, display selection, translation switching) through the `rpcHandler` bridge.
- **Commands** map to the same main-process actions as the desktop (`confirm|reject|next|prev|black`). Client count shown in the StatusBar and Settings.
- Enable/disable + port are settings (`remoteEnabled`, `remotePort`); state surfaces as `RemoteStatus` (`disabled|starting|running|error`).

---

## 12. Cloud account (Firebase, optional)

- Renderer-side Firebase Auth (Email/Password) is the **gate** for the operator UI. Config: `resources/firebase-config.json`.
- **Session persistence** via browser IndexedDB — after the first successful sign-in the app opens offline.
- **Restore bail-out** (added this cycle): if `onAuthStateChanged` hasn't fired within 10 s (dead network), the gate falls back to sign-in instead of hanging forever; if the SDK recovers later it upgrades the UI automatically. An error callback also lands on the gate.
- Friendly error mapping for every common Firebase code (wrong password, rate limit, network, disabled provider, etc.).
- Sign-out clears the local phase immediately and best-effort calls Firebase signOut.
- **Nothing in the live engine requires the account.** The `AccountProvider` in main additionally writes local device identity files (`account-session.json`, device file) under userData — a separate local concept from the Firebase gate.

---

## 13. EasyWorship integration (optional)

`src/main/integration/EasyWorship.ts` — free/local methods only:

- Filesystem detection of installed EasyWorship versions (Program Files / ProgramData / Start Menu scans), cached status.
- **Clipboard hand-off**: copy the current live scripture to the clipboard for pasting into EasyWorship's Bible input (`EASYWORSHIP_COPY`).
- No paid APIs, no SDKs, no DRM/activation interference. Absence or detection failure changes nothing in SermonSight.

---

## 14. State management, IPC contract, settings, logging

### Main-side AppState (`state.ts`)

```ts
interface AppState {
  revision: number
  db: DbStatus            // state, path, schema/db versions, translations, warnings
  translation: string     // active abbreviation e.g. "KJV"
  preview: Passage | null
  live: Passage | null
  black: boolean
  candidates: CandidateState  // candidates[5], activeIndex, lastTranscript, searching
  stt: SttStatus          // state, engine, message
  remote: RemoteStatus    // state, url, lanIp, port, pin, clients, error
  account: AccountStatus
  presentation: PresentationMeta // theme, flags, fontSizePct, displayId, windowOpen, fullscreen, page, pageCount
}
```

`patch()` bumps `revision` and invokes the broadcaster (operator window + presentation window + phone remote push).

### IPC contract (`src/shared/ipc.ts` — single source of truth)

Channels (all declared in one const object, all typed):

- Database: `db:choose`, `db:reload`, `db:status`
- Scripture: `scripture:search`, `scripture:passage`, `scripture:adjacent`, `scripture:translations`, `scripture:books`, `translation:set`
- Presentation: `presentation:preview|present|black|next|prev|open|close|fullscreen|setDisplay|settings|state|page`
- Candidates: `candidates:select|confirm|reject`
- Audio/STT: `audio:stream`, `stt:status`, `recognition:transcript`
- Remote: `remote:status|setEnabled|newPin`
- Account: `account:status|signIn|signOut`
- EasyWorship: `easyworship:status|copy`
- Settings/system: `settings:get|set`, `state:get`, `state:update`, `window:displays`, `log`

Preload exposes only `window.api = { invoke, send, on }` (contextIsolation on; channels whitelisted by using these three entry points against the const names).

### Settings (`settings.json` in userData)

`dbPath`, `translation`, `theme`, `showReference`, `showTranslationBadge`, `fontSizePct`, `displayId`, `remoteEnabled`, `remotePort`, `listenEnabled`, `logLevel`.

### Logging (`logger.ts`)

Daily rotating files: `%APPDATA%/SermonSight/logs/sermonsight-YYYY-MM-DD.log`; level configurable; flushed on quit. Renderer logs forwarded over `IPC.LOG`.

---

## 15. Build, packaging & installer

### npm scripts (package.json)

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `electron-vite dev` | development launch |
| `build` | `electron-vite build` | production bundles → `out/` |
| `typecheck` | `tsc --noEmit` (web + node tsconfigs) | full type safety |
| `rebuild` | `electron-rebuild -f -w better-sqlite3` | rebuild native module for Electron ABI |
| `db:public` | `python tools/build_public_db.py` | regenerate the public-domain DB + report |
| `dist` | `db:public` && `build` && `electron-builder --win nsis` | full installer pipeline |

> Dev-machine quirk: `npm run` script chaining can fail silently under this machine's PowerShell tooling; the equivalent direct binaries (`.\node_modules\.bin\electron-vite.CMD build`, `node node_modules\electron-builder\cli.js --win nsis`) are reliable. better-sqlite3 in `node_modules` is compiled for **Electron's ABI (130)**, so system Node (ABI 137) cannot `require` it — all standalone DB tooling uses Python.

### electron-builder.yml highlights

- `files`: only `out/**`, `package.json`, `resources/firebase-config.json` (source DB never packed into the asar)
- `extraResources`: `assets/sermonsight-public.ss` → `assets/sermonsight.ss` (public DB ships; licensed DB does not), `resources/remote`, `vendor/vosk` → `vosk`, `models`
- `asarUnpack`: better-sqlite3 + koffi (native)
- NSIS: non-per-machine, user-selectable directory, desktop + start-menu shortcuts, no data deletion on uninstall
- `artifactName`: `SermonSight-Setup-${version}.exe`

### Current release artifact (built 2026-10-10)

| Property | Value |
| --- | --- |
| File | `dist/SermonSight-Setup-0.2.0.exe` |
| Size | 176,453,203 bytes (~168 MB) |
| SHA-256 | `B198CEB4D8A3F7B42FBB18382CA99AFC2B774B05A33591A8CE2D8455960DC0BE` |
| Shipped DB | `resources/assets/sermonsight.ss` = 198,852,608 B, SHA-256 `783225B3…CA167A9` (matches public-db report; 20 PD translations; integrity ok) |
| Unsigned | No code-signing cert on this machine; electron-builder logs "signing is skipped" |

---

## 16. Testing & verification

No unit-test framework; verification is via standalone CDP e2e scripts (system Node launches `node_modules\electron\dist\electron.exe .` with `--remote-debugging-port`, drives the real app over the DevTools protocol) plus targeted probes in `tools/`.

### `tests/e2e-auth-display-stt.js` — 32 checks, currently **32/32 passing**

Covers: fresh-profile login gate → wrong-password error → real sign-in → session survives reload → DB loaded → presentation window opens → long-passage pagination (page count, page 1 default, verse-slice fits, `n/N` label, accent-colored verse numbers) → next/prev within passage then across passages → mic button honest labels → engine reaches `listening` with the real model → mic stop pauses (engine stays alive) → **synthetic speech** (Windows SAPI TTS WAV fed through the pipeline) produces a John 3 candidate at 0.9 confidence → header Sign out returns to the gate while the output window keeps running → sign-in again → app restart keeps the session → missing-model launch shows the honest unavailable banner with the actionable download message.

Test hardening added this cycle: disposable `--user-data-dir` profile per suite run (Firebase session restore from earlier probes used to flip the UI mid-test), longer waits for slow Firebase round trips, and sign-out selectors matched to the restored original header.

### Other suites/probes

- `tests/e2e-streaming-remote.js` — streaming + phone remote (written; scheduled in regression runs).
- `tools/tts.ps1` — Windows SAPI text-to-speech used to synthesize `tts.wav` fixtures for speech tests (avoids needing a live microphone; real-microphone verification remains an outstanding manual step — see §19).
- `tools/validate-db.js`, `db-check-118.js`, `stt-smoke.js`, `vosk-*.js` — DB and native-runtime diagnostics used during bring-up.

---

## 17. Project work history (this build cycle)

Chronological summary of what was done to reach 0.2.0:

1. **Repository translation import** — 595,252 verses imported from GitHub `sajeevavahini/bibles` into `assets/sermonsight.ss` (22 translations total including user-supplied NLT). Fixed an FK bug (missing `translations` rows), validated 0 FK violations, propagated to all local copies. NIV/MSG remain 0-verse placeholders.
2. **Database slimming** — 682.7 MB → 209.4 MB (−69%): `search_index` emptied (unused by app search), auxiliary indexes dropped, VACUUM; app search verified unaffected; backups kept (`assets/*.bak-*`).
3. **Phase 2 inspection** — full STT pipeline trace, UI map, hyphen audit, test/build inventory.
4. **STT reliability fixes (Phase 4)** — load-queue cap 600→100 frames (≈10 s), worker uncaught-exception → clean exit, SttHost bounded restart backoff (1/2/4 s, max 3), re-fork on error, restart-timer cleanup, `cancelSpeechSearches()` on mic-off, `stt:status` IPC handler, AudioInput VAD pre-roll buffer (5 frames).
5. **UI redesign then full revert (Phases 3 → revert)** — a Control-Rail/Right-Rail/hamburger redesign was implemented, typechecked, and e2e-validated, then **reverted at the owner's request**. Because the workspace was not yet a git repo, the exact original UI was recovered from the 0.1.0 installer's `app.asar` (extracted minified bundle + CSS) and restored byte-faithfully — the rebuilt CSS even reproduces the original content hash `index-Ba3ZsHYh.css`. Original components (`Sidebar`, `CandidatePanel` with Confirm/Reject, `ScriptureSearchScreen`, header Sign-out) are back; the redesign components were deleted.
6. **Auth restore bail-out** — 10-second timeout + error callback so a dead network can't hang the app behind "Restoring session…" (offline-first rule).
7. **Type fixes** — `PresentationMeta` seeded with `page`/`pageCount`; `lastTranscript` patch typing.
8. **Hyphen/copy cleanup (Phase 8)** — remote page "double-tap"→"double tap", "Un-black"→"Unblack"; README title/workflow/screens/translation/test-bullet refresh; foundation page "Offline-first"→"Offline"; package description de-hyphenated.
9. **Public DB pipeline (Phase 5)** — `tools/build_public_db.py` (Node version abandoned: ABI mismatch), report with SHA-256s, electron-builder wiring.
10. **Regression (Phase 9)** — e2e auth suite driven to 32/32 against the reverted UI (see §16).
11. **Installer (Phase 10)** — fresh `SermonSight-Setup-0.2.0.exe` built from current source; contents verified (public DB hash match, 20 translations, integrity ok).
12. **This document** — full technical documentation written.

---

## 18. Data inventory on the development machine

Working directory: `C:\Users\The Kreadive Galaxy\Desktop\My Products\SermonSight`

| Item | Detail |
| --- | --- |
| Master DB | `assets/sermonsight.ss` — 219,615,232 B (~209.4 MiB, 22 translation rows incl. local-only NLT/NKJV) |
| Public DB | `assets/sermonsight-public.ss` — 198,852,608 B, SHA-256 `783225B3140F7FC08D0C5020D53C40843AB96396797B929AB2103DC91CA167A9` |
| DB backups | `assets/*.bak-preslim-20261010-013044` (682.7 MB pre-slim), `*.bak-preimport-20261009-090500`, `*.bak-20261008-222014` |
| Import workspace | `.tmp-bibles/` — import scripts + `import-final-report.json` (local only, not part of the app) |
| Installer | `dist/SermonSight-Setup-0.2.0.exe` (+ `.blockmap`, `win-unpacked/`) |
| E2E fixtures | `%TEMP%\opencode\ss-probe\tts.wav` (SAPI speech fixture); disposable test profiles under `%TEMP%\opencode\ss-e2e-profile` |
| Machine | 2 CPU cores, frequently saturated; ~4.7 GB free disk at last build; Node 24.1.0, Python 3.13 |

---

## 19. Known limitations & outstanding items

1. **Real-microphone verification** — e2e speech tests use TTS audio through the same pipeline; an end-to-end test with a physical microphone + live pastor speech on the target church laptop is still a manual step.
2. **Code signing** — installer is unsigned (no certificate); SmartScreen will warn on first run until signed or reputation is established.
3. **GitHub repository state** — the remote currently contains only installer-era commits (tag v0.1.0; last commit removed the exe, leaving an effectively empty tree). **Source code has not been pushed yet.** Push plan: `git init` → commit current source → add remote → merge with `--allow-unrelated-histories` → push → create the v0.2.0 release and upload `SermonSight-Setup-0.2.0.exe` (verify uploaded asset hash equals the local SHA-256 above). Credentials exist on the machine (never printed); push auth untested.
4. **Licensed translations** (NLT, NKJV) exist only in the local master DB; never redistribute. NIV/MSG are placeholders awaiting licensed sources.
5. **npm script chaining** on this dev machine can fail silently — use direct binaries (§15).
6. **Phone remote** is LAN-only by design; exposing it to the internet is unsupported.
7. **Vosk model** ships in the installer (`models/vosk-model-small-en-us-0.15`); for other languages, drop a different model and set `SERMONSIGHT_VOSK_MODEL`.

---

## 20. Operator quick reference

| Want to… | Do |
| --- | --- |
| Open the projector output | Header **Open output** (or Sidebar → Open presentation window) |
| Find a scripture | `Ctrl+K` or Sidebar → Scripture Search → type → Enter |
| Show a search result | Single click = preview (safe); **Present** / double-click path = live |
| Start listening to the sermon | Sermon screen → **Start microphone** |
| Accept a voice match | Click to select → **Confirm** (or Enter) → then Present |
| Dismiss a match | **Reject** (or Esc) |
| Page through a long passage | Space / Next / Prev |
| Black the screen between points | `B` (or StatusBar Black button) |
| Pair a phone | Settings → enable Phone remote → scan QR → enter PIN |
| Change translation | Control Room preview panel dropdown |
| Recover from a DB error | Error dialog → **Choose file…** / **Try again** |

---

*Document generated 2026-10-10 for SermonSight 0.2.0 by the build session that performed the translation import, database slimming, STT reliability fixes, UI restore, public-DB pipeline, 32/32 regression run, and installer build described above.*
