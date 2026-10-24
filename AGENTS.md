# SYSTEM DIRECTIVE FOR OPENCODE: SERMONSIGHT ENGINEERING CORPUS

**Product:** SermonSight by The Kreadive Galaxy
**Target Environment:** Windows x64 (Electron 33, Node 24.1.0 dev host / ABI 130 runtime, Python 3.13 tooling)
**Document Intent:** Mandatory developer agent instructions, architectural invariants, feature preservation rules, and operational hygiene.

---

## 1. PRODUCT IDENTITY & PHILOSOPHY

SermonSight is an offline-first church presentation engine and real-time sermon scripture recognition system engineered for mission-critical reliability on Sunday mornings. It serves church media operators managing multi-display projection systems.

### Core Philosophy

1. **Sunday Reliability Over Novelty:** A Sunday morning service permits zero runtime crashes, zero unhandled rejections, and zero speculative features.
2. **Deterministic Utility Over AI Slop:** There are no LLM hallucinations, generic AI wrappers, or probabilistic publishing pipelines. The intelligence layer is deterministic: Vosk offline acoustic models → rule-based lexical parsing → candidate scoring → human gate.
3. **The Laptop is Sovereign:** The host laptop is the sole primary engine. Phone remotes are constrained LAN controllers. Cloud systems (Firebase) are optional gates that degrade gracefully within 10 seconds.
4. **Absolute Feature Preservation:** Refactoring, bug fixes, or optimizations must never strip, stub out, or simplify existing operational capabilities.

---

## 2. THE SEVEN ABSOLUTE ARCHITECTURAL INVARIANTS

Every modification, pull request, and code generation step inside this repository must satisfy these non-negotiable invariants:

1. **The Feature Preservation Mandate (Zero Regression / No Pruning):**
   Every existing feature documented in the technical inventory is production-essential. Agents and developers are strictly forbidden from "simplifying" the codebase by stubbing out edge cases, removing complex submodules, pruning translation support, or deleting auxiliary workflows (such as EasyWorship handoff, phone remote pairing, or pagination mechanics).

2. **The Human-in-the-Loop Gate:**
   AI/STT never auto-publishes to the audience. Recognized speech produces candidates; candidates go to Preview; an operator must explicitly execute a Present action (Enter, double-click, or remote confirm) to push text to the live projection window.

3. **Offline-First Autonomy:**
   The core presentation engine, manual search (Ctrl+K), and speech recognition pipeline must operate with 100% fidelity without an active internet connection or external cloud dependency.

4. **Scripture Truth & Zero Hallucination:**
   Scripture is never fabricated, synthesized, or approximated. If the SQLite database is absent or corrupted, the system presents a blocking DatabaseErrorOverlay. It must never display mock verses or fall back to default dummy text.

5. **Isolated Multi-Process Architecture:**
   - Intensive audio decoding (Vosk/Koffi) runs exclusively in a forked sttWorker.
   - SQLite LIKE queries run exclusively in a forked searchWorker.
   - The Electron main process handles state management, IPC routing, and window control.
   - The UI renderer handles display, classification, and presentation. Long tasks must never block the main thread or renderer compositor.

6. **Strict Data Separation (Master vs. Public):**
   Licensed texts (e.g., NLT, NKJV) are strictly restricted to the local development master database (assets/sermonsight.ss). Only the 20 public-domain translations compiled into assets/sermonsight-public.ss may be mapped to production installer artifacts (resources/assets/sermonsight.ss).

7. **No Spontaneous Redesigns:**
   The operator interface layout is locked to the owner-commissioned UI/UX reconstruction (superseding the original 210px|1fr|330px topology): frameless custom TitleBar (40px) + 220px Sidebar (Hub / Control Room / Presentations / Search / Settings + brand lockup) + full-width main area + StatusBar (30px), with the Control Room as a 3-column room (Microphone | Recognition Results table | Live Output). Do not attempt unsolicited UI overhauls, navigation restructuring, or cosmetic replacements beyond this locked design.

---

## 3. FEATURE PRESERVATION INVENTORY (LOCKED CAPABILITIES)

When making any codebase adjustments, the following features must be protected, maintained, and verified intact:

- **Dual-Window Presentation Pipeline:** Independent operator window and presentation projection window (`?window=presentation`) with multi-display assignment, fullscreen toggling, and output themes (classic, minimal, dark).
- **Intra-Passage & Inter-Passage Pagination:** Multi-verse passages (e.g., Psalm 118) must automatically paginate into discrete verse slices based on theme font sizing. Keyboard navigation (Space, Next, Prev) must step through slices within the passage before navigating to adjacent canonical references.
- **Instant Blackout Subsystem:** Hot-key B, remote BLACK, and StatusBar toggle immediately blank the audience display while preserving current slide and pagination state.
- **Acoustic Pre-Roll & Audio Classification:**
  - 500 ms (5-frame) Float32 pre-roll ring buffer in AudioInput.ts to prevent clipping the first spoken syllable of a book name.
  - Adaptive noise floor, VAD, and spectral centroid/flatness classification in AudioClassifier.ts to automatically drop silence and worship music so instrumental praise never pollutes STT.
- **Deterministic Lexical Parsing (ReferenceParser):** Support for spoken and written numbers, ordinal book prefixes (1/2/3 John, 1/2 Samuel), bare root resolution, verse ranges, and phrase snippet matching without an LLM.
- **Candidate Engine & Streaming Search Deduplication:** 5-candidate ceiling, 5-minute TTL, latest-wins sequence tracking, and auto-preview of top candidates without auto-presenting.
- **LAN Remote Control (LocalServer & PairingManager):**
  - Self-contained web client (resources/remote/index.html) served exclusively over private IPv4.
  - Dynamic QR code generation, 4-digit PIN authentication with 10-minute TTL, and WebSocket bidirectional state synchronization.
- **Session Resilience & Auth Bail-Out:** Firebase authentication gate with a strict 10-second offline bail-out fallback so network deadlocks never prevent local access to the Control Room.
- **EasyWorship Integration:** Zero-API filesystem detection of existing EasyWorship installations and clipboard hand-off bridge (EASYWORSHIP_COPY).
- **Diagnostics & Test Harness:** Injection testing tools in the Control Room diagnostics drawer (IPC.TRANSCRIPT bypass) and continuous verification via the CDP test suite (tests/e2e-auth-display-stt.js, 32/32 baseline).

---

## 4. TECHNICAL STACK & WORKSPACE RUNTIME MATRIX

| Layer | System / Dependency | Critical Constraint |
| :--- | :--- | :--- |
| **Desktop Shell** | Electron 33 (x64) | Single instance lock strictly enforced. |
| **Bundler** | electron-vite 2 (Vite 5) | Three discrete bundles: `main`, `preload`, `renderer`. |
| **Renderer UI** | React 18, TypeScript 5.7 | Plain CSS (`app.css`), zero UI component bloat libraries. |
| **Database** | SQLite via `better-sqlite3` | Native module built against **Electron ABI 130**. Opened strictly in read-only mode (`readonly: true`, `PRAGMA query_only=ON`). |
| **DB Automation** | Python 3 (`sqlite3`) | System Node (ABI 137) **cannot** load the native Electron SQLite binary. All standalone database transforms, migrations, and slimming scripts must use Python 3. |
| **Speech Engine** | Vosk (`vosk-model-small-en-us-0.15`) | Loaded via `koffi` in `sttWorker`. Audio captured at 48 kHz, classified, and downsampled to 16 kHz PCM16. |
| **LAN Remote** | Node `http` + `ws` | Strictly bound to private IPv4 blocks (`10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`). Enforces a 4-digit PIN with a 10-minute TTL. |
| **Verification** | CDP Headless Harness | Verified via Chrome DevTools Protocol end-to-end suites (`tests/e2e-auth-display-stt.js`, 32/32 passing). |

---

## 5. TKG DESIGN SYSTEM & ERGONOMIC RULES

When maintaining or updating any visual component in `src/renderer/`:

### Palette Constraints

- **Dark Canvas (Base):** Deep Charcoal `#0A0A0F`. Never use pure `#000000` for main surfaces to prevent OLED smearing and optical halation.
- **Card/Surface Elevation:** Slate/Elevated Dark `#14141C` and `#1C1C26`.
- **Primary Accent:** TKG Orange (`#FF6A00` / `#FF8C00`). Use for active focus, interactive targets, and confirmed state indicators.
- **Secondary Accent:** TKG Yellow (`#FFD400` / `#FFC107`). Use for warnings, badges, and candidate highlights.
- **Text & Contrast:** APCA Lightness Contrast compliance (L_c ≥ 75 for body text, L_c ≥ 45 for headlines).
- **THE STRICT BLUE BAN:** Do not inject blue buttons, cyan borders, or blue-to-purple gradient treatments. Blue is strictly restricted to external platform logos (e.g., EasyWorship iconography) and syntax highlighting.

### Spatial Discipline

- All layout margins, paddings, and component heights adhere to the 8-point spatial grid (with a 4-point sub-grid for micro-adjustments).
- Interactive touch/click boundaries must meet minimum dimensional criteria: desktop pointer targets must measure at least 28px × 28px; remote touch targets must measure at least 48dp × 48dp.

---

## 6. INTERACTION & SUBSYSTEM WORKFLOW RULES

### Speech-to-Text (SttHost → sttWorker)

- Audio is held in a memory-bounded loadQueue (max 10 seconds / 100 frames) while the Vosk model initializes. If the queue overflows, drop older frames rather than garbling the stream.
- The worker child process isolates native crashes. If the worker encounters an error, SttHost executes bounded exponential backoff (1s, 2s, 4s, max 3 attempts) and surfaces deterministic status banners to the UI.
- When the operator toggles the microphone off, `RecognitionService.cancelSpeechSearches()` must invalidate running pipelines via latest-wins sequence tokens to reject stale promises.

### Presentation Engine (PresentationController)

- **Paging Integrity:** Slicing calculations must respect punctuation and verse indices. Changing theme or font scale recalculates page splits dynamically without losing the active verse.
- **State Broadcast:** State transitions follow unidirectional data flow: Renderer action → IPC invoke → Main process `state.patch()` → IPC broadcast → Renderer store update.

---

## 7. CODE MODIFICATION & PR HYGIENE DIRECTIVES

When tasked with fixing bugs, writing tests, or implementing approved adjustments:

1. **Anti-Degradation Rule:** Before touching any file, verify what existing features rely on it. Never remove props, drop event handlers, or comment out branches to "make a test pass quickly."
2. **No Phantom Dependencies:** Do not add npm packages for utilities that can be written cleanly in native TypeScript or Node.js built-ins.
3. **Never Chain NPM Scripts on Windows:** The local environment runs Windows PowerShell 5.1, where npm chained scripts (`&&`) can fail silently. Execute commands directly or sequentially via direct binary invocations (e.g., `.\node_modules\.bin\electron-vite.CMD build`).
4. **Preserve ABI Boundaries:** Do not attempt to run Node.js scripts that import better-sqlite3 using the global system Node. Use Python scripts in `tools/` for standalone SQLite transforms.
5. **Zero AI Slop in Code:**
   - No commented-out dead code or speculative `// TODO: implement later` blocks.
   - No unhandled promises or empty `catch (e) {}` blocks.
   - No generic `any`-typing. Maintain end-to-end type safety across the IPC boundary.
6. **Mandatory Verification Protocol:** Any architectural or logic change must be validated against the end-to-end test harness (`tests/e2e-auth-display-stt.js`). The 32/32 check baseline must not regress.
