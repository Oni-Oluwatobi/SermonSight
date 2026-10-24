# SermonSight — UI/UX Reconstruction Audit (Phase 1)

**Directive:** SYSTEM DIRECTIVE & IMPLEMENTATION PROMPT: SERMONSIGHT UI/UX RECONSTRUCTION
**Date:** 2026-10-15
**Auditor:** OpenCode (Principal Desktop Software Engineer role)
**Scope:** Desktop shell (Electron), Presentation output window, LAN Web Controller (Node http/WS), design-token system, IPC contract, offline assets.

> **STATUS (2026-10-20):** Phase 1 snapshot — the reconstruction it audited has since been
> **completed** (Phases 2–6). The file/component map below describes the *pre-reconstruction*
> UI (Dashboard/Sermon/Settings/ScriptureSearch screens, CandidatePanel) which no longer
> exists. The implemented state: frameless TitleBar + 220px Sidebar + 3-column Control Room
> (AGENTS.md §2.7), TKG token system with light theme, rewritten web controller. Verified:
> typecheck 0/0, build 0, e2e 32/32, installer rebuilt 2026-10-20.

---

## 1. Process & File Map

```
Electron main process (src/main/)
├── index.ts                 bootstrap, single-instance lock, lifecycle, menu wiring
├── ipc.ts                   ALL ipcMain.handle/on registrations, remote start, RPC bridge
├── state.ts                 AppState store — revision counter, patch(), broadcast
├── windows.ts               operator BrowserWindow (frame: default, bg #0a0a0f) + presentation BrowserWindow (bg #000000, display-targeted)
├── settings.ts              SettingsShape persistence (userData JSON)
├── logger.ts                leveled file/console logger
├── presentation/PresentationController.ts  preview/live/black/pagination/advance, display + fullscreen
├── recognition/RecognitionService.ts       transcript → ReferenceParser → candidates (latest-wins, cancel)
├── stt/SttHost.ts           forked sttWorker lifecycle, loadQueue, backoff (1/2/4s ×3)
├── stt/sttWorker.ts         koffi → Vosk model, 16 kHz PCM16 decode, honest unavailable states
├── stt/voskLib.ts           koffi bindings
├── database/DatabaseService.ts   better-sqlite3 READ-ONLY open (readonly + PRAGMA query_only)
├── database/SearchService.ts     forked searchWorker LIKE queries (latest-wins)
├── database/searchWorker.ts      child process: DB queries
├── remote/LocalServer.ts    LAN HTTP + WS server (private IPv4 only, QR, PIN/session)
├── remote/PairingManager.ts 4-digit PIN (10 min TTL), session tokens from QR
├── integration/EasyWorship.ts   FS detection + clipboard hand-off
└── account/AccountProvider.ts    Firebase auth status/sign-in/sign-out (main side)

Preload (src/preload/index.ts)
└── contextBridge `window.api` — invoke/send/on with channel allow-lists
    INVOKE = every IPC.* value; SEND = audio:stream, log, presentation:page;
    LISTEN = state:update, presentation:state

Shared contract (src/shared/ipc.ts)
└── 40 IPC channels + AppState/DbStatus/Candidate/SttStatus/RemoteStatus/
    PresentationMeta/SearchResponse/SettingsShape/DisplayInfo types

Renderer (src/renderer/src/)
├── App.tsx                  shell: header, Sidebar | main | right panel, StatusBar, keyboard router
├── state/store.ts           subscription to state:update / presentation:state
├── components/Sidebar.tsx   nav (ScreenId: dashboard | search | sermon | settings)
├── components/CandidatePanel.tsx  ConfidenceBar, candidate cards, Confirm/Reject
├── components/StatusBar.tsx DB/remote/audio status strip + blackout toggle
├── components/DatabaseErrorOverlay.tsx  blocking overlay (zero-hallucination invariant)
├── screens/DashboardScreen.tsx    Stage preview + readiness panels
├── screens/SermonScreen.tsx       mic toggle, state banners, IPC.TRANSCRIPT injection harness
├── screens/ScriptureSearchScreen.tsx  Ctrl+K search (results → Preview/Present)
├── screens/SettingsScreen.tsx     settings form
├── screens/PresentationScreen.tsx ?window=presentation output renderer (themes, slice measuring, watermark-free today)
├── screens/LoginScreen.tsx        auth gate (10 s offline bail-out)
├── audio/AudioInput.ts     getUserMedia → 500 ms pre-roll → VAD/classifier → audio:stream
├── auth/firebaseAuth.ts    renderer auth with 10 s restore bail-out
└── styles/app.css          single stylesheet (post-TKG-2026 migration: #0A0A0F canvas, orange/yellow accents)

Web controller (resources/remote/index.html — served verbatim by LocalServer)
└── 448-line single-file app: pair screen, live card, candidates, transport,
    scripture search, translation switch, WS + fetch RPC client

Verification
└── tests/e2e-auth-display-stt.js — CDP harness, 32/32 green (updated for orange accent)
```

---

## 2. IPC Contract Inventory (Phase 3/4 must not break)

### 2.1 Invoke channels (renderer → main, handled in `src/main/ipc.ts`)

| Channel | Handler purpose | UI consumers |
|---|---|---|
| `db:choose` / `db:reload` / `db:status` | DB file picker + reload + status | Settings, StatusBar, overlay |
| `scripture:search` | forked LIKE search, latest-wins | ScriptureSearchScreen, remote RPC `search` |
| `scripture:translations` | translation list | Settings, search UI |
| `presentation:preview` | stage preview set (reason-tagged) | candidates, search, remote `setPreview` |
| `presentation:present` | **explicit live publish (human gate)** | Present buttons, remote `setLive` |
| `presentation:black` | blackout on/off | StatusBar, `B` key, remote `black` |
| `presentation:next` / `:prev` | advance slice/passage | transport keys/buttons |
| `presentation:open` / `:close` / `:fullscreen` / `:setDisplay` | window lifecycle | header, settings |
| `presentation:settings` | theme/font/ref toggles | Settings, keyboard |
| `candidates:select` / `:confirm` / `:reject` | candidate pipeline | CandidatePanel, remote confirm/reject |
| `recognition:transcript` | **test-injection bypass (diagnostics)** | SermonScreen harness, e2e |
| `translation:set` | active translation switch | search UI, remote `setTranslation` |
| `stt:status` | engine status query | SermonScreen |
| `remote:status` / `:setEnabled` / `:newPin` | remote lifecycle + PIN | StatusBar, pairing modal |
| `account:status` / `:signIn` / `:signOut` | auth gate | LoginScreen, header |
| `easyworship:status` / `:copy` | EasyWorship bridge | Settings/sermon |
| `settings:get` / `:set` | settings persistence | SettingsScreen |
| `state:get` | full AppState snapshot | all screens, e2e |
| `window:displays` | display enumeration | output-target selector |
| `log` | renderer → file logger | store |

### 2.2 Send-only (renderer → main): `audio:stream`, `log`, `presentation:page`
### 2.3 Listen (main → renderer): `state:update` (AppState), `presentation:state` (PresentationMeta)

### 2.4 Declared but UNHANDLED / UNCALLED (kept as contract placeholders — do not prune)
`scripture:passage`, `scripture:adjacent`, `scripture:books` — exist in `IPC` constants only; no `ipcMain.handle`, no caller today. Available for the new Search modal (chapter/verse browser) if wired in Phase 3.

---

## 3. LAN Web Controller Protocol (Phase 5 rebuild must preserve)

**Transport security:** binds only to private IPv4 (`10/192.168/172.16-31`); WS upgrade requires `?token=` session; HTTP `/api/pair {pin}` redeems 4-digit PIN (10 min TTL); QR carries `/?token=` so scan skips PIN.

| Route | Method | Payload | Result |
|---|---|---|---|
| `/` `/index.html` | GET | — | single-file controller (`no-store`) |
| `/health` | GET | — | `{ok, app}` |
| `/api/pair` | POST | `{pin}` | session `{token, …}` or 401 |
| `/api/rpc` | POST | `{token, op, …}` | `{ok, result|error}` |
| `/ws` | WS | — | state stream + commands |

**WS server→client:** `{type:'state', state: AppState}` (snapshot on connect + on every patch), `{type:'remote-status', status}`.
**WS client→server:** `{type:'command', cmd: 'confirm'|'reject'|'next'|'prev'|'black'}`.
**RPC ops:** `search`, `setPreview`, `setLive`, `adjacent`, `setTranslation`, `getState`.
**Invariant:** DB never leaves the laptop — only requests/results cross the LAN. Command execution routes through the same human-gate helpers as the desktop UI.

---

## 4. Offline Asset Chain (untouchable)

| Asset | Location (dev → packaged) | Notes |
|---|---|---|
| Master DB | `assets/sermonsight.ss` (209 MiB, 22 translations, 657,457 verses) | local-only NLT/NKJV etc.; NEVER in installer |
| Public DB | `assets/sermonsight-public.ss` → `resources/assets/sermonsight.ss` (20 PD translations, 595,252 verses) | electron-builder extraResources |
| Vosk model | `models/vosk-model-small-en-us-0.15` → `resources/models/…` | `SERMONSIGHT_VOSK_MODEL` env override |
| Vosk DLLs | `vendor/vosk` → `resources/vosk` | via koffi in sttWorker |

`DatabaseService` opens read-only (`readonly:true`, `PRAGMA query_only=ON`). Missing/invalid DB ⇒ blocking `DatabaseErrorOverlay` (never mock verses).

---

## 5. Design Token Delta — current vs TKG Master Standard (§1 of directive)

Applied in the 2026-10-15 palette pass; the directive's token table is the authority. Exact reconciliation for Phase 2:

| Token (directive) | Value | Current `app.css` equivalent | Delta |
|---|---|---|---|
| `--tkg-canvas-base` | `#0A0A0F` | `--bg: #0a0a0f` | ✅ equal (rename) |
| `--tkg-surface-primary` | `#14141C` | `--bg-panel: #14141c` | ✅ equal (rename) |
| `--tkg-surface-elevated` | `#1C1C26` | `--bg-elev: #1c1c26` | ✅ equal (rename) |
| `--tkg-surface-overlay` | `#232330` | `--bg-hover: #242430` | ⚠️ 1-step hex fix |
| `--tkg-surface-border` | `#2A2A38` | `--border: #2a2a34` | ⚠️ 1-step hex fix |
| `--tkg-surface-border-hi` | `#3E3E52` | `--border-strong: #3a3a47` | ⚠️ replace |
| `--tkg-orange-primary` | `#FF6A00` | `--accent: #ff6a00` | ✅ equal (rename) |
| `--tkg-orange-hover` | `#FF8C00` | `--accent-strong: #ff8c00` | ✅ equal (rename) |
| `--tkg-yellow-primary` | `#FFD400` | — (new) | ➕ add (confidence stars, secondary) |
| `--tkg-yellow-muted` | `#FFC107` | `--warn: #ffc107` | ✅ equal (rename) |
| `--tkg-status-live` | `#10B981` | `--ok: #2ea043` | ⚠️ new green |
| `--tkg-status-warn` | `#F59E0B` | — | ➕ new (60–79 % confidence) |
| `--tkg-status-error` | `#EF4444` | `--live: #e5484d` | ⚠️ new red (rename: was "live") |
| `--tkg-text-primary` | `#FFFFFF` | `--text: #e8ecf3` | ⚠️ pure white for headline/scripture |
| `--tkg-text-secondary` | `#9CA3AF` | `--text-dim: #98a2b3` | ⚠️ replace |
| `--tkg-text-tertiary` | `#6B7280` | `--text-faint: #6b7686` | ✅ ≈ equal (replace) |
| radius sm/md/lg | 6/10/16 | 7/10/(none-lg) | ⚠️ add lg, fix sm |
| spacing scale | 2…40 px (8-pt) | ad-hoc | ➕ declare and migrate usage |

**Blue audit (post-pass):** zero blue accents/gradients remain in `app.css`, TSX, themes, remote client (verified by pattern sweep). Blue-ban compliant.
**Pure `#000000` audit:** kept only where spec mandates (blackout `pres.blackout`, presentation window base behind blackout). Surfaces use `#0A0A0F` per "No Pure Black" rule.

---

## 6. Gap Analysis — spec requirement → current capability → work class

### A. Desktop shell (Image 2)

| Spec requirement | Current state | Class |
|---|---|---|
| Custom title bar: brand lockup, "Offline church presentation + sermon scripture recognition.", `● Offline Mode` pill, min/max/close targets | Default frame, no custom title bar | **NEW** — `frame:false` + drag regions + IPC `window:minimize/maximize/close` (new channels + handlers), `● Offline Mode` pill (deterministic: LAN/online status) |
| Sidebar 220 px: TKG orange K emblem; nav Control Room (active = orange bar + `#1C1C26` + white), Search, Presentations, Settings; bottom lockup "The Kreadive Galaxy" + exact tagline `Empowering the World with Innovative AI` | Sidebar 210 px, nav dashboard/search/sermon/settings, no tagline lockup | **REBUILD** — relabel + restyle + tagline; keep ScreenId routing (`dashboard`→Control Room, `sermon`→mic/STT pane content moves to Control Room col 1) |
| Control Room top bar: title + "Listen. Detect. Confirm. Present."; Open Output ▾ + Display 2 (Projector) ▾ selector | No top bar; output open/assign exists via `presentation:open`/`setDisplay` + `window:displays` | **NEW UI, existing IPC** |
| Col 1: Mic Status Card (pill ● Microphone Active, live visualizer canvas from real audio stream, dB meter fallback, Settings link, status ring "Live Recognition: Listening…", ⏸ Pause + ⏹ Stop) | Real audio features exist (`AudioInput` → `audio:stream {features: rms/db/…}`); mic UI lives on SermonScreen | **NEW UI on existing streams** — feed ring/canvas from `AudioStatus.level` + `FrameFeatures` (must stay wired to live hardware; static fallback when muted) |
| Quick Controls guide: Space / ← → / B / Ctrl+K matrix | Shortcuts exist in App.tsx | **NEW UI** (documentation panel only) |
| Col 2: segmented tabs Recognition Results \| Scripture Search; candidate table (Reference, Text partial, Confidence semantic badge green 92 % / amber 68 %, Action `Preview`); ≥5 rows, dividers; "View all results →" | CandidatePanel right-rail cards + full search screen | **REBUILD** — table layout + tab switcher; confidence → badge semantics (≥80 green live, 60–79 status-warn, <60 muted); Preview action = `presentation:preview` only |
| Col 3: Live Output header (● Live badge, "Current Slide: John 3:16"); 16:9 stage thumbnail replicating projector slide (bg template + typography); solid `#FF6A00` ▶ Present CTA visually isolated; slide bar `<`, `1 / 1`, output toggle | Dashboard has Stage preview (not 16:9, not theme-accurate); Present exists (`presentation:present`) | **REBUILD** — 16:9 mini render driven by same theme/pagination data; Present CTA + mis-click isolation (spacing/hit-slop) |
| Layout topology | CSS Grid `210px 1fr 330px` (locked in AGENTS §2.7) | **SUPERSEDED** by this directive — AGENTS.md §2.7/§3 must be updated to the new 220 px sidebar + 3-column Control Room topology (owner-commissioned redesign) |

### B. Presentation output window

| Spec requirement | Current state | Class |
|---|---|---|
| Frameless, display-targeted, no chrome/cursor interference | Exists (windows.ts, fullscreen, displayId) | ✅ keep |
| APCA \|Lc\| > 75, ref title, quoted passage, translation id `John 3:16 (NIV)` | Themes give ref + optional translation badge (`showTranslationBadge`) | ✅ mostly; verify `John 3:16 (NIV)` format + APCA on all 3 themes |
| Configurable bg asset layer (gradient or church imagery) | 3 solid-color themes | **EXTEND** — add gradient layer to themes (keep 3 existing ids intact); imagery = theme background field only (no upload feature unless requested later) |
| Bottom-left `Slide 1 of 1`, bottom-right `SermonSight by The Kreadive Galaxy` watermarks | Not present | **NEW** — PresentationScreen overlay (must hide during blackout; never show operator metadata) |
| Blackout ≤ 50 ms to `#000000` on B / IPC | Exists (CSS `!important` + hot-key) | ✅ keep, verify timing in Phase 4 |
| Operator metadata/confidence/transcripts NEVER on output | Enforced (separate window renders only passage) | ✅ invariant — regression-test |

### C. Modals (Image 2 bottom row)

| Modal | Current state | Class |
|---|---|---|
| Scripture Search (Ctrl+K): header input, Testament segments (All/OT/NT), split results \| preview pane, translation tag, `→ Preview` + `+ Add to Presentation` (orange) | ScriptureSearchScreen = full screen, same data path | **CONVERT screen→modal** — keep `scripture:search` + preview/present invocations; add testament filtering (client-side over results or query filter); "Add to Presentation" maps to explicit Present (human gate stays) |
| Settings dialog: rail General/Presentation/Audio/Recognition/Database/Remote/Firebase/About; General = Theme Dark/Light, Language, toggles Open last session / Auto Save / Notifications; Cancel + solid orange Save | SettingsScreen exists (presentation/remote/db fields) | **REBUILD + EXTEND** — categories map to real subsystems; new toggles must be **real**: `openLastSession` (restore last screen/output on boot), `autoSave` (settings write-through flag), `notifications` (Electron `Notification` on new candidate/errors when enabled). Language selector: English only today → selector present, option list honest (single locale, disabled note) — no fake translations. |
| Phone Remote Pairing: ● Connected local IP, high-contrast QR, PIN 4827-style 4-digit, Disconnect | Full backend exists (LocalServer/PairingManager: QR data-url, PIN, clients, enable/disable) | **NEW UI on existing IPC** (`remote:status/newPin/setEnabled`) |
| Hub & Recent Sessions: CTAs Open Control Room / Open Presentation + Recent Sessions list with timestamps (Sunday Service, Youth Conference…) | None | **NEW feature (genuine persistence)** — append-only JSON session log in userData (started/ended + optional operator label); empty state honest until real sessions exist; rename allowed. Never seed fake sessions. |

### D. Web controller (Image 1)

| Spec requirement | Current state | Class |
|---|---|---|
| Header: "SermonSight Web Controller", ● Connected `192.168.1.24 · PIN: 4827`, Host pill `Laptop (Control Room)`, gear | Phone-first header (brand + conn dot) | **REBUILD** (data already in `remote-status` + `state`) |
| Presentation status card: pulsing ● Presentation Live, passage, `Display 2 (Projector)`, slide index | Live card exists (ref/text) | **EXTEND** (presentation meta in AppState) |
| Transport: `<< Previous`, large center `⏸ Pause` (orange), `>> Next` | prev/next/black commands exist | **SEEK CONFIRMATION** — semantic of `⏸ Pause` is ambiguous (no matching backend op today); see §8 Open Questions |
| 2×2 grid: Open Scripture, Black Screen, Open Media, Clear Screen | Black exists; scripture search exists; **Media library** does not exist in product | **PARTIAL** — Open Scripture (search panel), Black Screen (`black`). "Open Media"/"Clear Screen": no media subsystem exists in SermonSight today → wire to honest no-op placeholders **only with user decision** (see §8), else omit rather than fake |
| Microphone card: waveform, hardware toggle, ● Recognition Active | STT states exist on desktop; remote has no mic control today | **NEW RPC/WS op** (`micOn/micOff` routed through main → sttHost) + UI |
| Activity log with timestamps | None | **NEW** — client-visible log fed by new WS `activity` events (commands, presents, blackouts) — main-side ring buffer |
| Quick Scripture search + saved slide shortcuts | Search RPC exists; saved slides don't | **SEARCH = EXISTING**, saved slides = new persisted list (same session-store pattern) |
| Mobile <600 px: thumb-zone transport (lower 40 %), bottom nav Home/Slides/Bible/Media/Settings, 48 dp targets | Phone remote (transport + search, 48 dp already bumped) | **REBUILD** responsive; bottom nav views map: Home (status), Slides (candidates/staging), Bible (search), Media (pending decision), Settings (translation/remote) |
| Controller modals: Bible Search (KJV/NLT switchers), Scripture Slides manager (+ Add/Edit/Reorder), Media library (All/Images/Videos/Audio), Settings sheet, Scan to Connect QR | Search + translation switch exist; slides manager/media do not | **PARTIAL/NEW** — Bible search + translation switchers = existing RPC; Slides manager = new client-side saved-slides (backed by session store); Media library = **blocked on product decision** (no media engine) |

---

## 7. Verification & Risk Register (Phase 6 + preservation)

**e2e baseline (32/32) selectors that the rebuild must keep or update in lockstep:**
`#auth-email` / `#auth-password` / `.auth-submit` / `.auth-error`, `.app`, header button `Sign out`, nav button matching `/Sermon/i` (mic pane entry), `Start microphone` / `Stop microphone` labels, `.state-banner .state-title` (text `speech engine unavailable`), `.state-banner .faint`, presentation target URL `window=presentation`, verse-number accent `rgb(255, 106, 0)`, pagination behavior, `IPC.TRANSCRIPT` injection path.
→ Any DOM restructure **must** update `tests/e2e-auth-display-stt.js` selectors in the same change; assertion semantics may not weaken. Re-run at Phase 6.

**Locked features that must survive (AGENTS §3):** dual-window pipeline, intra/inter-passage pagination, blackout, 500 ms pre-roll + audio classification, ReferenceParser, 5-candidate/5-min-TTL/latest-wins, human-gate Present, LAN remote PIN/QR/session, 10 s auth bail-out, EasyWorship handoff, diagnostics injection, master/public DB separation, offline-first (no new network deps), DatabaseErrorOverlay.

**New IPC introduced by shell rebuild (planned):** `window:minimize`, `window:maximize`/`window:unmaximize` or toggle, `window:close` — declared in `shared/ipc.ts`, handled in `ipc.ts`, allowed in preload `INVOKE_SET` (allow-list updates automatically via `Object.values(IPC)`), plus `window:isMaximized` + maximize state events for the custom title bar. All existing channels unchanged.

**Risk — frameless window:** custom title bar removes native controls; must supply drag region (`-webkit-app-region: drag`) + working min/max/close with double-click behavior, and never block the auth gate. Fallback: keep `frame:false` only after e2e confirms login flow.

**Risk — web controller size:** single-file HTML grows substantially; keep it self-contained (no bundler, no CDN — offline/LAN only), plain JS + CSS with TKG tokens.

---

## 8. Open Questions (blocking specific items, not the pipeline)

1. **Reference images not attached** to the directive. Image 2 (desktop) and Image 1 (web) are described in prose — build proceeds from prose; attach images for final visual-parity sign-off.
2. **`⏸ Pause` transport button (web controller)** — no backend semantics exist. Candidates: (a) blackout-style freeze of output, (b) pause/resume microphone recognition, (c) decorative/disabled until defined. Needs owner decision + image.
3. **Open Media / Media library / Audio-visual subsystem** — SermonSight has no media engine today. Options: implement as clearly-labeled "coming soon" disabled states, hide entirely, or scope a real media layer (large addition). Needs owner decision.
4. **AGENTS.md §2.7/§3 update** — the locked 210 px|1fr|330 px layout lock conflicts with this commissioned topology; will be amended to reference this directive as authority after implementation.

---
*Audit complete — no code or IPC contracts were modified during Phase 1.*
