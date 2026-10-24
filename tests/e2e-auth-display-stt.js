/* SermonSight E2E: Firebase auth gate, presentation pagination/display, STT honest states.
   Run with system Node: node tests\e2e-auth-display-stt.js
   Uses a disposable probe account (delete it from the Firebase console afterwards). */
const http = require('http')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const PROJ = path.join(__dirname, '..')
const ELECTRON = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9344
const EMAIL = process.env.SS_TEST_EMAIL || 'ss-e2e-probe@sermonsight.test'
const PASSWORD = process.env.SS_TEST_PASSWORD || 'E2eProbe!234'
const TTS_WAV = path.join(process.env.TEMP, 'opencode', 'ss-probe', 'tts.wav')
// Disposable Chromium profile per suite run: Firebase persists its session in
// IndexedDB/localStorage, and a leftover session from an earlier probe run can
// restore mid-test and unmount the login form (flaky "Illegal invocation").
const PROFILE_DIR = path.join(process.env.TEMP, 'opencode', 'ss-e2e-profile')

const results = []
let appProc = null

function pass(name, detail) { results.push({ ok: true, name }); console.log(`PASS ${name}${detail ? ' - ' + detail : ''}`) }
function fail(name, detail) { results.push({ ok: false, name }); console.log(`FAIL ${name} - ${detail}`) }
function check(name, cond, detail) { cond ? pass(name, detail) : fail(name, detail); return !!cond }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('getJson timeout')))
  })
}

class Target {
  constructor(wsUrl) { this.url = wsUrl; this.ws = null; this.pending = new Map(); this.nextId = 0 }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('ws error')) })
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
        else p.resolve(msg.result)
      }
    }
  }
  cdp(method, params) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('cdp timeout: ' + method)) } }, 60000)
    })
  }
  async eval(expression) {
    const r = await this.cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }
  /** Eval with retries — CPU-heavy phases (model load) can starve the target past one timeout. */
  async evalRetry(expression, tries = 3) {
    let lastErr
    for (let i = 0; i < tries; i++) {
      try { return await this.eval(expression) } catch (e) { lastErr = e }
    }
    throw lastErr
  }
}

async function findPage(match) {
  // 300 attempts (150s): a cold Electron boot on a loaded 2-core host can
  // exceed the original 60s window before the first page target registers.
  for (let i = 0; i < 300; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)
      const hit = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && (!match || t.url.includes(match)))
      if (hit) return hit
    } catch { /* not up */ }
    await sleep(500)
  }
  throw new Error('CDP target not found: ' + (match || 'page'))
}

function launch(args = [], env = {}) {
  appProc = spawn(ELECTRON, ['.', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE_DIR}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...args], {
    cwd: PROJ, stdio: 'ignore', detached: false, env: { ...process.env, SERMONSIGHT_STT_PRIORITY: 'high', ...env }
  })
  console.log('launched pid=' + appProc.pid)
}

function killApp() {
  if (!appProc) return
  try { spawn('taskkill', ['/PID', String(appProc.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* */ }
  appProc = null
}

async function waitPortFree(timeoutMs = 12000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`)
      await sleep(500)
    } catch {
      return true
    }
  }
  return false
}

async function waitFor(page, expr, timeoutMs, want = true) {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < timeoutMs) {
    try { last = await page.eval(expr); if (Boolean(last) === want) return last } catch { /* reload race */ }
    await sleep(400)
  }
  return last
}

async function clickSoon(page, expr, timeoutMs = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ok = await page.eval(`!!(${expr}) && (() => { (${expr}).click(); return true })()`)
      if (ok) return true
    } catch { /* frame busy */ }
    await sleep(350)
  }
  return false
}

/** Sign out from the rebuilt shell: sidebar Settings → Account tab → Sign out. */
async function signOutViaSettings(page) {
  await clickSoon(page, `[...document.querySelectorAll('.nav-item')].find(b => /Settings/i.test(b.textContent))`, 8000)
  await waitFor(page, `!!document.querySelector('.modal')`, 8000)
  await clickSoon(page, `[...document.querySelectorAll('.rail-item')].find(b => /Account/i.test(b.textContent))`, 8000)
  await clickSoon(page, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out')`, 8000)
}

/** Navigate to the Control Room (mic + state banner live there). */
async function openControlRoom(page) {
  await clickSoon(page, `[...document.querySelectorAll('.nav-item')].find(b => /Control Room/i.test(b.textContent))`, 8000)
}

function readPcm16k(file) {
  const b = fs.readFileSync(file)
  let pos = 12, fmt = null, data = null
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4)
    const size = b.readUInt32LE(pos + 4)
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) }
    if (id === 'data') data = b.subarray(pos + 8, pos + 8 + size)
    pos += 8 + size + (size % 2)
  }
  const mono = []
  for (let i = 0; i + 1 < data.length; i += 2 * fmt.channels) mono.push(data.readInt16LE(i))
  const ratio = fmt.rate / 16000
  const out = new Int16Array(Math.floor(mono.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const p = i * ratio, i0 = Math.floor(p)
    const v = mono[i0] + (mono[Math.min(i0 + 1, mono.length - 1)] - mono[i0]) * (p - i0)
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)))
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
}

async function main() {
  const { WebSocket } = require('ws')

  // Own the machine: a stray app from a previous run would keep port 9344 and
  // this run would attach to ITS window mid-state-change (flaky "Illegal invocation").
  try { require('child_process').spawnSync('taskkill', ['/IM', 'electron.exe', '/F'], { stdio: 'ignore' }) } catch { /* */ }
  // Stray test nodes from earlier runs keep clicking through their old CDP sessions.
  try {
    const ps = require('child_process').spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    let rows = []
    try { const j = JSON.parse(ps.stdout || '[]'); rows = Array.isArray(j) ? j : [j] } catch { /* no json */ }
    for (const r of rows) {
      if (r && r.ProcessId !== process.pid && /e2e|probe|ss-probe/i.test(String(r.CommandLine || ''))) {
        require('child_process').spawnSync('taskkill', ['/PID', String(r.ProcessId), '/F'], { stdio: 'ignore' })
        console.log('killed stray test node', r.ProcessId)
      }
    }
  } catch { /* best effort */ }
  await sleep(3000)

  // wipe the disposable profile ONCE so launch 1 starts signed out; launch 2
  // below reuses the same profile to prove session persistence across restarts
  try { require('fs').rmSync(PROFILE_DIR, { recursive: true, force: true }) } catch { /* */ }

  // ================= LAUNCH 1: auth gate + display + STT =================
  launch()
  const page = new Target((await findPage()).webSocketDebuggerUrl)
  await page.connect()
  await page.cdp('Runtime.enable')

  // -- gate visible on fresh profile (login FORM mounted — .auth-card also matches the transient loading card)
  const firstState = await waitFor(page, `document.getElementById('auth-email') ? 'gate' : (document.querySelector('.app') ? 'app' : '')`, 30000)
  if (firstState === 'app') {
    // previous run left a session — sign out so the gate path is exercised
    await signOutViaSettings(page)
    await waitFor(page, `!!document.getElementById('auth-email')`, 15000)
  }
  const authCard = await waitFor(page, `!!document.getElementById('auth-email')`, 5000)
  const appHidden = await waitFor(page, `!document.querySelector('.app')`, 2000)
  check('1 gate: login screen visible', !!authCard)
  check('1b gate: operator app hidden', !!appHidden)

  // -- wrong password (inputs are guaranteed mounted by check 1)
  await page.eval(`(() => { const set=(id,v)=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('auth-email',${JSON.stringify(EMAIL)});set('auth-password','definitely-wrong-1'); })()`)
  await page.eval(`document.querySelector('.auth-submit').click()`)
  const gotErr = await waitFor(page, `(document.querySelector('.auth-error')?.textContent || '').includes('incorrect')`, 15000)
  check('2 wrong password error shown', !!gotErr, gotErr ? 'shown' : 'no error text')

  // -- correct sign-in
  await page.eval(`(() => { const set=(id,v)=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('auth-password',${JSON.stringify(PASSWORD)}); })()`)
  await page.eval(`document.querySelector('.auth-submit').click()`)
  // slow networks can take >20s for the Firebase round trip — allow it
  const appIn = await waitFor(page, `!!document.querySelector('.app')`, 45000)
  check('3 sign-in opens operator app', !!appIn)
  // account identity lives in Settings → Account (renderer auth store, not main's device registry)
  await clickSoon(page, `[...document.querySelectorAll('.nav-item')].find(b => /Settings/i.test(b.textContent))`, 8000)
  await waitFor(page, `!!document.querySelector('.modal')`, 8000)
  await clickSoon(page, `[...document.querySelectorAll('.rail-item')].find(b => /Account/i.test(b.textContent))`, 8000)
  const acctText = await page.eval(`document.querySelector('.settings-content')?.textContent || ''`)
  check('3b account shows signed-in email', acctText.includes('ss-e2e-probe'), acctText.slice(0, 90).replace(/\s+/g, ' '))
  await page.eval(`document.querySelector('.modal-head .tb-btn')?.click()`)

  // -- reload keeps session
  await page.cdp('Page.reload').catch(() => page.eval(`location.reload()`))
  await sleep(2500)
  const page2 = new Target((await findPage()).webSocketDebuggerUrl)
  await page2.connect()
  await page2.cdp('Runtime.enable')
  const stillIn = await waitFor(page2, `!!document.querySelector('.app')`, 30000)
  check('4 session survives reload', !!stillIn)
  const gateAfter = await page2.eval(`!!document.getElementById('auth-email')`)
  check('4b no login screen after reload', !gateAfter)

  // -- DB ready
  let state = await page2.eval(`window.api.invoke('state:get')`)
  check('5 DB loaded', state.db.state === 'loaded', state.db.path)

  // ================= pagination + display =================
  await page2.eval(`window.api.invoke('presentation:open')`)
  await sleep(2500)
  const presList = (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).filter((t) => t.url.includes('window=presentation'))
  check('6 presentation window open', presList.length > 0, `${presList.length} target(s)`)
  const pres = new Target(presList[0].webSocketDebuggerUrl)
  await pres.connect()
  await pres.cdp('Runtime.enable')

  await page2.eval(`window.api.invoke('presentation:present', 'Psalm 118')`)
  let pc = 0
  for (let i = 0; i < 25 && pc < 2; i++) { state = await page2.eval(`window.api.invoke('state:get')`); pc = state.presentation.pageCount; await sleep(500) }
  check('7 long passage paginates', pc > 2, `pageCount=${pc}`)
  check('7b starts on page 1', state.presentation.page === 0, `page=${state.presentation.page}`)

  const presDom = await pres.eval(`(() => {
    const verses = [...document.querySelectorAll('.pres-body:not(.pres-measure) .pres-verse')]
    const rects = verses.map(v => v.getBoundingClientRect())
    const inBounds = rects.length > 0 && rects.every(r => r.bottom <= window.innerHeight && r.top >= 0)
    const num = document.querySelector('.pres-verse .num')
    return {
      count: verses.length,
      inBounds,
      pageNum: document.querySelector('.pres-pagenum')?.textContent || '',
      numColor: num ? getComputedStyle(num).color : '',
      align: document.querySelector('.pres-body')?.className || ''
    }
  })()`)
  check('8 visible slice fits window', presDom.inBounds, `${presDom.count} verses rendered, page label "${presDom.pageNum}"`)
  const passageLen = state.live.verses.length
  check('8b slice smaller than passage', presDom.count > 0 && presDom.count < passageLen, `${presDom.count}/${passageLen}`)
  check('8c page indicator shows n/N', /1 \/ \d+/.test(presDom.pageNum), presDom.pageNum)
  check('8d verse numbers in theme accent', presDom.numColor === 'rgb(255, 106, 0)', presDom.numColor)

  await page2.eval(`window.api.invoke('presentation:next')`)
  await sleep(700)
  state = await page2.eval(`window.api.invoke('state:get')`)
  check('9 next pages within passage first', state.presentation.page === 1 && /Psalm?s 118/.test(state.live.reference), `page=${state.presentation.page} ref=${state.live.reference}`)

  await page2.eval(`window.api.invoke('presentation:prev')`)
  await sleep(700)
  state = await page2.eval(`window.api.invoke('state:get')`)
  check('9b prev returns to page 1', state.presentation.page === 0, `page=${state.presentation.page}`)

  await page2.eval(`window.api.invoke('presentation:prev')`)
  await sleep(700)
  state = await page2.eval(`window.api.invoke('state:get')`)
  check('9c prev at page 1 moves passage', /Psalm?s 117/.test(state.live.reference), `ref=${state.live.reference}`)

  await page2.eval(`window.api.invoke('presentation:present', 'John 3:16')`)
  await sleep(800)
  state = await page2.eval(`window.api.invoke('state:get')`)
  check('10 new passage resets pages', state.presentation.page === 0 && state.presentation.pageCount === 1, `page=${state.presentation.page}/${state.presentation.pageCount}`)

  // ================= STT: honest states + TTS feed =================
  await openControlRoom(page2)
  await sleep(500)
  const micClicked = await clickSoon(page2, `[...document.querySelectorAll('button')].find(b => /Start microphone/i.test(b.textContent))`)
  check('11 mic button found', micClicked)
  const btnText = await waitFor(page2, `[...document.querySelectorAll('button')].some(b => /Stop microphone/i.test(b.textContent))`, 12000)
  check('11b mic starts with honest label', !!btnText, btnText ? 'Stop microphone shown' : 'no toggle')
  let sttState = ''
  for (let i = 0; i < 200; i++) { try { state = await page2.eval(`window.api.invoke('state:get')`); sttState = state.stt.state } catch { /* starved target — retry */ } if (sttState === 'listening') break; if ((sttState === 'unavailable' || sttState === 'error') && i >= 5) break; await sleep(600) }
  check('12 engine reaches listening (model installed)', sttState === 'listening', `stt=${sttState} ${state?.stt?.message || ''}`)

  // Stop the (fake) mic before feeding TTS: its continuous silence interleaves
  // with our chunks and segments the utterance, truncating the transcript.
  // Engine stays alive — feed() runs while paused and flips it back to listening.
  const micWasRunning = await clickSoon(page2, `[...document.querySelectorAll('button')].find(b => /Stop microphone/i.test(b.textContent))`, 5000)
  for (let i = 0; i < 15; i++) { state = await page2.eval(`window.api.invoke('state:get')`); if (state.stt.state === 'paused') break; if (!micWasRunning && (state.stt.state === 'listening' || state.stt.state === 'paused')) break; await sleep(400) }
  check('12b mic stop pauses engine (alive)', state.stt.state === 'paused' || !micWasRunning, `stt=${state.stt.state} micWasRunning=${micWasRunning}`)

  const pcm = readPcm16k(TTS_WAV)
  const b64 = pcm.toString('base64')
  await page2.eval(`(async () => {
    const bin = atob(${JSON.stringify(b64)})
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // burst-send: per-chunk timers stretch under CPU starvation and trickle the
    // feed across tens of seconds, racing the model load.
    for (let i = 0; i < bytes.length; i += 3200) {
      window.api.send('audio:stream', { type: 'pcm', data: bytes.subarray(i, Math.min(i + 3200, bytes.length)) })
    }
    window.api.send('audio:stream', { type: 'flush' })
    return true
  })()`)
  let cand = null
  let lastSeen = ''
  let stable = 0
  for (let i = 0; i < 60; i++) {
    try { state = await page2.eval(`window.api.invoke('state:get')`) } catch { await sleep(600); continue }
    if (state.candidates.candidates.length > 0) { cand = state.candidates.candidates[0]; break }
    const t = state.candidates.lastTranscript || ''
    if (t && t === lastSeen) stable++
    else stable = 0
    lastSeen = t
    if (stable >= 4 && /john/i.test(t)) break // final settled on the reference — don't read early partials
    await sleep(600)
  }
  const heard = (lastSeen || state.candidates.lastTranscript || '') + ' ' + (cand ? cand.reference + ' ' + cand.text : '')
  check('13 TTS audio produced transcript/candidate', !!cand || heard.toLowerCase().includes('john'), heard.slice(0, 120))
  if (cand) check('13b candidate points at John 3', /John 3/.test(cand.reference), `${cand.reference} conf=${cand.confidence}`)

  // ================= sign out / sign in =================
  await signOutViaSettings(page2)
  const backToGate = await waitFor(page2, `!!document.getElementById('auth-email') && !document.querySelector('.app')`, 12000)
  check('14 sign out returns to login gate', !!backToGate)
  const presStillOpen = (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).filter((t) => t.url.includes('window=presentation')).length
  check('14b output window keeps running on logout', presStillOpen > 0, `${presStillOpen} output target(s)`)

  await waitFor(page2, `!!document.getElementById('auth-email') && !!document.getElementById('auth-password')`, 10000)
  await page2.eval(`(() => { const set=(id,v)=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('auth-email',${JSON.stringify(EMAIL)});set('auth-password',${JSON.stringify(PASSWORD)}); })()`)
  await page2.eval(`document.querySelector('.auth-submit').click()`)
  const inAgain = await waitFor(page2, `!!document.querySelector('.app')`, 45000)
  check('15 sign in again works', !!inAgain)

  killApp()
  // taskkill can lag under CPU pressure; if the first instance still owns the
  // CDP port/single-instance lock, LAUNCH 2 exits before opening any page.
  await waitPortFree(45000)
  await sleep(1500)

  // ================= LAUNCH 2: engine unavailable honesty + restart persistence =================
  // A cold relaunch on a saturated 2-core host can exit before registering its
  // CDP page (lock not yet released) — retry until the instance stays alive.
  for (let attempt = 0; attempt < 3; attempt++) {
    launch([], { SERMONSIGHT_VOSK_MODEL: 'C:\\no-such-vosk-model' })
    await sleep(3500)
    if (appProc && appProc.exitCode === null) break
    console.log(`launch 2 exited early (code ${appProc ? appProc.exitCode : 'n/a'}), retrying`)
    await waitPortFree(15000)
    await sleep(1000)
  }
  const pageA = new Target((await findPage()).webSocketDebuggerUrl)
  await pageA.connect()
  await pageA.cdp('Runtime.enable')
  const persisted = await waitFor(pageA, `!!document.querySelector('.app')`, 30000)
  check('16 session persists across app restart', !!persisted)

  await openControlRoom(pageA)
  await sleep(500)
  await clickSoon(pageA, `[...document.querySelectorAll('button')].find(b => /Start microphone/i.test(b.textContent))`)
  await waitFor(pageA, `[...document.querySelectorAll('button')].some(b => /Stop microphone/i.test(b.textContent))`, 12000)
  const banner = await waitFor(pageA, `(document.querySelector('.state-banner .state-title')?.textContent || '').includes('speech engine unavailable')`, 15000)
  state = await pageA.eval(`window.api.invoke('state:get')`)
  check('17 unavailable engine: honest banner', !!banner, banner ? 'banner shown' : 'banner missing')
  check('17b unavailable engine: stt state', state.stt.state === 'unavailable', `stt=${state.stt.state}: ${state.stt.message || ''}`.slice(0, 140))
  const detail = await pageA.eval(`document.querySelectorAll('.state-banner .faint')[0]?.textContent || ''`)
  check('17c banner shows actionable model message', (detail || '').toLowerCase().includes('model'), String(detail).slice(0, 110))

  killApp()
  await sleep(1200)

  // ================= summary =================
  const failed = results.filter((r) => !r.ok)
  console.log(`\n==== ${results.length - failed.length}/${results.length} passed ==== `)
  failed.forEach((f) => console.log('FAILED: ' + f.name))
  process.exit(failed.length ? 1 : 0)
}

main()
  .catch((e) => { console.error('FATAL', e); killApp(); process.exit(2) })
  .finally(() => { if (appProc) killApp() })
