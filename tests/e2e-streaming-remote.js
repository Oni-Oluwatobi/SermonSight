/* SermonSight E2E: streaming voice→search, remote device count, phone double-tap.
   Run with system Node: node tests\e2e-streaming-remote.js

   Phase 15 coverage:
     T1  mic starts → recognition active
     T2-5 partial transcripts search immediately and refine (no final, no silence wait)
     T6  speech-end transition (final transcript) handled
     T7  a new phrase starts a fresh search
     T8  manual text search unchanged
     T9  phone connects → device count = 1 (real WS connections)
     T10 double-tap on phone → scripture goes LIVE immediately
     T11 disconnect → device count = 0
     T12 live presentation state still intact
*/
const http = require('http')
const { spawn } = require('child_process')
const path = require('path')

const PROJ = path.join(__dirname, '..')
const ELECTRON = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9344
const PHONE_CDP_PORT = 9345
// Disposable Chromium profile per suite run: Firebase persists its session in
// userData, so a shared profile makes the auth-gate checks non-deterministic.
const PROFILE_DIR = path.join(process.env.TEMP, 'opencode', 'ss-e2e-profile2')
const EMAIL = process.env.SS_TEST_EMAIL || 'ss-e2e-probe@sermonsight.test'
const PASSWORD = process.env.SS_TEST_PASSWORD || 'E2eProbe!234'

const results = []
let appProc = null
let phoneBrowserProc = null

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

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = Buffer.from(JSON.stringify(body))
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => resolve({ status: res.statusCode, body: d }))
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('postJson timeout')))
    req.end(data)
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
  async evalRetry(expression, tries = 3) {
    let lastErr
    for (let i = 0; i < tries; i++) {
      try { return await this.eval(expression) } catch (e) { lastErr = e }
    }
    throw lastErr
  }
}

async function findPage(match) {
  // 300 attempts (150s): cold Electron boot on a loaded 2-core host.
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

function killPhoneBrowser() {
  // Edge re-parents its browser process away from the spawned launcher, so
  // taskkill on the launcher PID alone misses the processes holding the phone
  // WS. Kill whatever owns the phone CDP port, then the launcher tree too.
  try {
    const ps = require('child_process').spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-NetTCPConnection -LocalPort ${PHONE_CDP_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const pid of String(ps.stdout || '').trim().split(',').filter(Boolean)) {
      spawn('taskkill', ['/PID', pid.trim(), '/T', '/F'], { stdio: 'ignore' })
    }
  } catch { /* */ }
  if (phoneBrowserProc) {
    try { spawn('taskkill', ['/PID', String(phoneBrowserProc.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* */ }
    phoneBrowserProc = null
  }
}

async function waitFor(page, expr, timeoutMs, want = true) {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < timeoutMs) {
    try { last = await page.eval(expr); if (Boolean(last) === want) return last } catch { /* busy */ }
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

const getState = (page) => page.eval(`window.api.invoke('state:get')`)

async function waitStt(page, want, timeoutMs) {
  const t0 = Date.now()
  let s = ''
  while (Date.now() - t0 < timeoutMs) {
    try { const st = await getState(page); s = st.stt.state; if (s === want) return s } catch { /* starved */ }
    await sleep(500)
  }
  return s
}

async function waitCandidates(page, pred, timeoutMs) {
  const t0 = Date.now()
  let st = null
  while (Date.now() - t0 < timeoutMs) {
    try { st = await getState(page); if (pred(st)) return st } catch { /* starved */ }
    await sleep(400)
  }
  return st
}

/** Inject a transcript exactly like the STT worker would deliver it.
    A starved renderer can blow the 60s CDP budget — degrade to a logged miss
    so later checks still run (they fail honestly) instead of aborting the suite. */
const inject = (page, text, partial) =>
  page.eval(`window.api.invoke('recognition:transcript', ${JSON.stringify(text)}, ${partial})`)
    .catch((e) => { console.log('inject failed: ' + ((e && e.message) || e)); return null })

async function main() {
  const { WebSocket } = require('ws')

  // Own the machine (see e2e-auth-display-stt.js): stray apps keep port 9344,
  // stray test nodes keep driving their old CDP sessions.
  try { require('child_process').spawnSync('taskkill', ['/IM', 'electron.exe', '/F'], { stdio: 'ignore' }) } catch { /* */ }
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

  // wipe the disposable profile so this run starts signed out (fresh login path)
  try { require('fs').rmSync(PROFILE_DIR, { recursive: true, force: true }) } catch { /* */ }
  await sleep(1000)

  launch()
  const page = new Target((await findPage()).webSocketDebuggerUrl)
  await page.connect()
  await page.cdp('Runtime.enable')

  // -- sign in (or use the persisted session from a previous run)
  const gated = await waitFor(page, `!!document.getElementById('auth-email') || !!document.querySelector('.app')`, 30000)
  if (gated === true) {
    const hasApp = await page.eval(`!!document.querySelector('.app')`)
    if (!hasApp) {
      await page.eval(`(() => { const set=(id,v)=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('auth-email',${JSON.stringify(EMAIL)});set('auth-password',${JSON.stringify(PASSWORD)}); })()`)
      await page.eval(`document.querySelector('.auth-submit').click()`)
      await waitFor(page, `!!document.querySelector('.app')`, 20000)
    }
  }
  const appIn = await waitFor(page, `!!document.querySelector('.app')`, 15000)
  check('1 sign-in app visible', !!appIn)

  let state = await getState(page)
  check('1b DB loaded', state.db.state === 'loaded', state.db.path)

  // Warm the search worker before the streaming checks: on a 2-core box the
  // worker can miss its ready deadline under load, and streaming partials would
  // then time out. This waits out (or rides out) any restart/fallback cycle.
  let warm = null
  const warmT0 = Date.now()
  while (Date.now() - warmT0 < 120000) {
    try {
      warm = await page.eval(`window.api.invoke('scripture:search', 'John 3:16', 'KJV')`)
      if (warm && warm.results && warm.results.length > 0) break
    } catch { /* worker busy/timeout — retry */ }
    await sleep(2000)
  }
  check('1c search worker warm', !!(warm && warm.results && warm.results.length > 0),
    `after ${Math.round((Date.now() - warmT0) / 1000)}s top=${warm && warm.results && warm.results[0] && warm.results[0].reference}`)

  // ================= T1: mic starts → engine active =================
  await clickSoon(page, `[...document.querySelectorAll('.nav-item')].find(b => /Control Room/i.test(b.textContent))`, 20000)
  await sleep(500)
  await clickSoon(page, `[...document.querySelectorAll('button')].find(b => /Start microphone/i.test(b.textContent))`, 25000)
  const micOn = await waitFor(page, `[...document.querySelectorAll('button')].some(b => /Stop microphone/i.test(b.textContent))`, 20000)
  check('2 mic starts', !!micOn, micOn ? 'Stop microphone shown' : 'no toggle')
  let stt = await waitStt(page, 'listening', 420000)
  check('3 recognition active (listening)', stt === 'listening', `stt=${stt}`)

  // ================= T6a: stop speaking / mic → engine pauses accurately =================
  await clickSoon(page, `[...document.querySelectorAll('button')].find(b => /Stop microphone/i.test(b.textContent))`, 20000)
  stt = await waitStt(page, 'paused', 15000)
  check('4 mic stop → engine paused (honest state)', stt === 'paused', `stt=${stt}`)

  // ================= status sync fix: restart must resume, not stay paused =================
  await clickSoon(page, `[...document.querySelectorAll('button')].find(b => /Start microphone/i.test(b.textContent))`, 25000)
  stt = await waitStt(page, 'listening', 30000)
  check('5 mic restart resumes engine (no paused desync)', stt === 'listening', `stt=${stt}`)

  // ================= T2-5: streaming partials search immediately =================
  // No final transcript is sent: candidates MUST appear from partials alone.
  await inject(page, 'For God so loved', true)
  let st = await waitCandidates(page, (s) => s.candidates.candidates.length > 0, 8000)
  let cands = st ? st.candidates.candidates : []
  check('6 partial "For God so loved" searches immediately (no final)', cands.length > 0,
    `${cands.length} candidate(s): ${cands.map((c) => c.reference).join(', ')}`)

  await inject(page, 'For God so loved the world', true)
  st = await waitCandidates(page, (s) =>
    s.candidates.lastTranscript === 'For God so loved the world' &&
    s.candidates.candidates.some((c) => /John 3/.test(c.reference)), 20000)
  cands = st ? st.candidates.candidates : []
  const top = cands[0]
  check('7 growing partial refines: John 3 strongest', !!top && /John 3/.test(top.reference),
    `top=${top ? top.reference : 'none'} all=[${cands.map((c) => c.reference + ':' + c.confidence).join(', ')}]`)
  const previewRef = st && st.preview ? st.preview.reference : null
  check('7b top candidate previewed (not live)', !!previewRef && /John 3/.test(previewRef) && !st.live,
    `preview=${previewRef} live=${st && st.live ? st.live.reference : 'none'}`)

  const ids = cands.map((c) => c.canonicalId)
  check('7c candidates unique (no duplicate concatenation)', new Set(ids).size === ids.length, `${ids.length} ids`)

  // ================= T6b: speech ends → final transcript handled =================
  await inject(page, 'For God so loved the world that he gave his only begotten Son', false)
  st = await waitCandidates(page, (s) =>
    s.candidates.lastTranscript === 'For God so loved the world that he gave his only begotten Son' &&
    !s.candidates.searching, 20000)
  check('8 final transcript settles search', !!st && st.candidates.candidates.length > 0,
    `transcript="${st && st.candidates.lastTranscript}" searching=${st && st.candidates.searching}`)

  // ================= T7: a new phrase starts a fresh search =================
  await inject(page, 'The Lord is my shepherd', true)
  st = await waitCandidates(page, (s) =>
    s.candidates.candidates.some((c) => /Psalms? 23/.test(c.reference)), 20000)
  cands = st ? st.candidates.candidates : []
  const top2 = cands[0]
  check('9 new phrase searches: Psalm 23 top', !!top2 && /Psalms? 23/.test(top2.reference),
    `top=${top2 ? top2.reference : 'none'} all=[${cands.map((c) => c.reference + ':' + c.confidence).join(', ')}]`)

  // ================= T8: manual search still works =================
  const manual = await page.eval(`window.api.invoke('scripture:search', 'John 3:16', 'KJV')`)
  check('10 manual search unchanged', manual && manual.results && manual.results.length > 0 &&
    manual.results[0].reference === 'John 3:16',
    `kind=${manual && manual.kind} top=${manual && manual.results && manual.results[0] && manual.results[0].reference}`)

  // ================= T9/11: remote device count from real connections =================
  await page.eval(`window.api.invoke('remote:setEnabled', true)`)
  let rstat = null
  for (let i = 0; i < 30; i++) {
    rstat = await page.eval(`window.api.invoke('remote:status')`)
    if (rstat && rstat.state === 'running') break
    await sleep(500)
  }
  check('11 remote server running', rstat && rstat.state === 'running', `url=${rstat && rstat.url} err=${rstat && rstat.error}`)
  const lanUrl = rstat.url
  const pin = rstat.pin

  const pair = await postJson(`${lanUrl}/api/pair`, { pin })
  let phoneToken = null
  try { phoneToken = JSON.parse(pair.body).token } catch { /* below */ }
  check('12 phone pairs with PIN', pair.status === 200 && !!phoneToken, `status=${pair.status}`)

  const wsUrl = lanUrl.replace('http://', 'ws://') + '/ws?token=' + encodeURIComponent(phoneToken)
  const s1 = new WebSocket(wsUrl)
  await new Promise((res, rej) => { s1.onopen = res; s1.onerror = () => rej(new Error('ws1 error')) })
  st = await waitCandidates(page, (s) => s.remote.clients === 1, 8000)
  check('13 phone connect → Remote devices 1', !!st && st.remote.clients === 1, `clients=${st && st.remote.clients}`)
  const bar1 = await waitFor(page, `document.body.innerText.includes('Remote 1 connected')`, 6000)
  check('13b status bar shows Remote 1 connected', !!bar1)

  const s2 = new WebSocket(wsUrl)
  await new Promise((res, rej) => { s2.onopen = res; s2.onerror = () => rej(new Error('ws2 error')) })
  st = await waitCandidates(page, (s) => s.remote.clients === 2, 8000)
  check('14 second device → count 2', !!st && st.remote.clients === 2, `clients=${st && st.remote.clients}`)

  s1.close()
  s2.close()
  st = await waitCandidates(page, (s) => s.remote.clients === 0, 8000)
  check('15 disconnect → Remote devices 0', !!st && st.remote.clients === 0, `clients=${st && st.remote.clients}`)
  const bar0 = await waitFor(page, `document.body.innerText.includes('Remote 0 connected')`, 6000)
  check('15b status bar shows Remote 0 connected', !!bar0)

  // Diagnostics: record every operator-side key/mouse/IPC event from here on —
  // if anything changes candidates/live without the phone, this names it.
  await page.eval(`(() => {
    window.__ev = []
    const tag = (e) => { try { return String((e.target && (e.target.id || e.target.className || e.target.tagName)) || '?').slice(0, 50) } catch (err) { return '?' } }
    window.addEventListener('keydown', (e) => window.__ev.push('key:' + e.key + '@' + tag(e)), true)
    window.addEventListener('mousedown', (e) => window.__ev.push('mouse:' + tag(e)), true)
    try {
      const orig = window.api.invoke
      window.api.invoke = function (ch) {
        try {
          if (/candidate|present/i.test(String(ch))) window.__ev.push('ipc:' + ch + ':' + JSON.stringify([].slice.call(arguments, 1)).slice(0, 70))
        } catch (e) { /* */ }
        return orig.apply(window.api, arguments)
      }
      window.__hooked = true
    } catch (e) { window.__hooked = false }
  })()`).catch(() => false)

  // ================= T10: phone page single-tap preview, double-tap live =================
  // Primary path: a real Edge instance joins the controller exactly like a phone
  // would (its own profile + CDP on a second port). Electron's browser-level
  // Target.createTarget is unsupported, and renderer window.open lands on a hung
  // navigation for LAN URLs from the file:// operator page — keep those as last
  // resorts only.
  const phoneUrl = lanUrl + '/?token=' + phoneToken
  const phoneOpen = await (async () => {
    const edgeCandidates = [
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ].filter(Boolean)
    const edge = edgeCandidates.find((p) => { try { return require('fs').existsSync(p) } catch { return false } })
    if (edge) {
      const edgeProfile = path.join(process.env.TEMP, 'opencode', 'ss-phone-edge-profile')
      try { require('fs').rmSync(edgeProfile, { recursive: true, force: true }) } catch { /* */ }
      // Warm Edge on about:blank first, then Page.navigate to the LAN URL —
      // cold first-run renderers on this 2-core box can wedge a 60s CDP eval
      // if navigation and first-paint race each other.
      phoneBrowserProc = spawn(edge, [
        `--remote-debugging-port=${PHONE_CDP_PORT}`,
        `--user-data-dir=${edgeProfile}`,
        '--no-first-run', '--no-default-browser-check',
        '--disable-gpu', '--disable-extensions',
        '--window-size=430,900',
        'about:blank'
      ], { stdio: 'ignore' })
      let warm = null
      for (let i = 0; i < 30; i++) {
        try {
          const list = await getJson(`http://127.0.0.1:${PHONE_CDP_PORT}/json/list`)
          const hit = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && t.url === 'about:blank')
          if (hit) { warm = hit; break }
        } catch { /* not up */ }
        await sleep(400)
      }
      if (warm) {
        const w = new Target(warm.webSocketDebuggerUrl)
        try {
          await w.connect()
          await w.cdp('Runtime.enable')
          await w.cdp('Page.enable')
          await w.eval(`true`)
          await w.cdp('Page.navigate', { url: phoneUrl })
          for (let i = 0; i < 40; i++) {
            const u = await w.eval(`location.href`).catch(() => '')
            if (String(u).includes(':7433')) {
              await sleep(800)
              const list2 = await getJson(`http://127.0.0.1:${PHONE_CDP_PORT}/json/list`)
              const hit2 = list2.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && t.url.includes(':7433'))
              try { if (w.ws) w.ws.close() } catch { /* */ }
              if (hit2) return { info: hit2, browser: null }
              break
            }
            await sleep(400)
          }
        } catch (e) { console.log('edge warm/nav failed: ' + ((e && e.message) || e)) }
        try { if (w.ws) w.ws.close() } catch { /* */ }
      } else {
        console.log('Edge never exposed an about:blank page')
      }
      console.log('Edge phone path failed — falling back')
    } else {
      console.log('Edge not found — falling back to Electron window paths')
    }
    try {
      const ver = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`)
      const browser = new Target(ver.webSocketDebuggerUrl)
      await browser.connect()
      const created = await browser.cdp('Target.createTarget', { url: phoneUrl, newWindow: true, background: false })
      const tid = created && created.targetId
      if (tid) {
        for (let i = 0; i < 20; i++) {
          try {
            const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)
            const hit = list.find((t) => t.id === tid && t.webSocketDebuggerUrl)
            if (hit) return { info: hit, browser }
          } catch { /* */ }
          await sleep(300)
        }
      }
      try { if (browser.ws) browser.ws.close() } catch { /* */ }
    } catch (e) { console.log('createTarget failed: ' + ((e && e.message) || e)) }
    // fallback: renderer window.open + scan the target list
    try {
      await page.eval(`window.open(${JSON.stringify(phoneUrl)}, 'ss-phone-test')`)
    } catch { /* */ }
    for (let i = 0; i < 20; i++) {
      try {
        const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)
        const hit = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl &&
          t.url.startsWith('http') && t.url.includes(':7433'))
        if (hit) return { info: hit, browser: null }
      } catch { /* */ }
      await sleep(500)
    }
    return null
  })()
  const phoneInfo = phoneOpen ? phoneOpen.info : null
  const browserConn = phoneOpen ? phoneOpen.browser : null

  let phoneResult = null
  const phone = phoneInfo ? new Target(phoneInfo.webSocketDebuggerUrl) : null
  if (phone) {
    try {
      await phone.connect()
      await phone.cdp('Runtime.enable')
      const appShown = await waitFor(phone, `!document.getElementById('shell').hidden`, 10000)
      if (!appShown) {
        const diag = await phone.eval(`JSON.stringify({ href: location.href, body: document.body.innerText.slice(0, 120) })`)
        phoneResult = { error: 'phone app not shown (token/pairing): ' + diag }
      } else {
        // capture every frame the phone sends over its WS (diagnostics)
        await phone.eval(`(() => { window.__sent = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { try { window.__sent.push(String(d).slice(0, 110)) } catch (e) { /* */ } return o.apply(this, arguments) }; return true })()`)
        // switch to the Bible Search view (#q lives there in the new controller)
        await phone.eval(`(() => { const b = document.querySelector('[data-view="bible"]'); if (b) b.click(); return !!b })()`)
        await sleep(300)
        await phone.eval(`document.getElementById('q').value = 'John 3:16'; document.getElementById('searchBtn').click()`)
        const hasRes = await waitFor(phone, `!!document.querySelector('.sres')`, 8000)
        if (!hasRes) {
          phoneResult = { error: 'no search results in phone page' }
        } else {
          const before = await getState(page)
          // single tap → select + preview only, never live
          await phone.eval(`document.querySelector('.sres').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
          const selectedAfterSingle = await waitFor(phone, `!!document.querySelector('.sres.sel')`, 3000)
          let afterSingle = null
          for (let i = 0; i < 8; i++) {
            await sleep(400)
            afterSingle = await getState(page)
            if (afterSingle.preview && afterSingle.preview.reference === 'John 3:16') break
          }
          // double tap → live. Both clicks are dispatched synchronously: a
          // background window's timers get throttled >350ms, which would break
          // the double-tap window (real finger taps are event-driven, not timers).
          await phone.eval(`(() => { const el = document.querySelector('.sres'); const c = () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })); c(); c() })()`)
          let afterDouble = null
          for (let i = 0; i < 15; i++) {
            await sleep(400)
            afterDouble = await getState(page)
            if (afterDouble.live && afterDouble.live.reference === 'John 3:16') break
          }
          phoneResult = {
            resultText: await phone.eval(`(document.querySelector('.sres') || {}).textContent || ''`),
            selected: !!selectedAfterSingle,
            selectedAfterDouble: await phone.eval(`!!document.querySelector('.sres.sel')`),
            phoneErr: await phone.eval(`document.getElementById('searchErr').textContent`),
            phoneSent: await phone.eval(`JSON.stringify((window.__sent || []).slice(-8))`),
            liveBefore: before.live ? before.live.reference : null,
            previewAfterSingle: afterSingle && afterSingle.preview ? afterSingle.preview.reference : null,
            liveAfterSingle: afterSingle && afterSingle.live ? afterSingle.live.reference : null,
            liveAfterDouble: afterDouble && afterDouble.live ? afterDouble.live.reference : null
          }
        }
      }
    } catch (e) {
      phoneResult = { error: String((e && e.message) || e) }
    } finally {
      // close the phone window (drops its WS connection)
      try {
        const closer = browserConn || phone
        await closer.cdp('Target.closeTarget', { targetId: phoneInfo.id })
      } catch {
        try { await phone.eval(`window.close()`) } catch { /* */ }
      }
      try { if (phone.ws) phone.ws.close() } catch { /* */ }
      try { if (browserConn && browserConn.ws) browserConn.ws.close() } catch { /* */ }
      killPhoneBrowser()
    }
  } else {
    phoneResult = { error: 'phone window never opened' }
  }

  check('16 phone search renders results', !!phoneResult && !phoneResult.error && !!phoneResult.resultText,
    phoneResult && phoneResult.error ? phoneResult.error : phoneResult && phoneResult.resultText)
  check('16b single tap selects + previews (not live)',
    !!phoneResult && phoneResult.selected &&
    phoneResult.previewAfterSingle === 'John 3:16' && phoneResult.liveAfterSingle === null,
    phoneResult ? `preview=${phoneResult.previewAfterSingle} live=${phoneResult.liveAfterSingle}` : 'no result')
  check('17 double tap displays scripture LIVE immediately',
    !!phoneResult && phoneResult.liveAfterDouble === 'John 3:16',
    phoneResult ? `live=${phoneResult.liveAfterDouble} sel=${phoneResult.selectedAfterDouble} phoneErr=${JSON.stringify(phoneResult.phoneErr)}` : 'no result')

  // phone disconnects (browser killed) → count 0, live output untouched
  st = await waitCandidates(page, (s) => s.remote.clients === 0, 25000)
  check('18 phone disconnect → count back to 0', !!st && st.remote.clients === 0, `clients=${st && st.remote.clients}`)
  const finalState = await getState(page).catch(() => null)
  const evLog = await page.eval(`JSON.stringify({ hooked: !!window.__hooked, ev: window.__ev || [] })`).catch(() => 'n/a')
  let targets = []
  try {
    targets = (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).map((t) => t.type + ' ' + t.url.slice(0, 55))
  } catch { /* */ }
  console.log('DIAG operator events: ' + evLog)
  console.log('DIAG phone sent: ' + (phoneResult && phoneResult.phoneSent))
  console.log('DIAG targets: ' + JSON.stringify(targets))
  check('19 live scripture persists after phone disconnect (presentation intact)',
    !!finalState && finalState.live && finalState.live.reference === 'John 3:16',
    finalState && finalState.live ? `live=${finalState.live.reference}` : 'no live')

  await page.eval(`window.api.invoke('remote:setEnabled', false)`).catch(() => {})

  killApp()
  await sleep(1200)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n==== ${results.length - failed.length}/${results.length} passed ==== `)
  failed.forEach((f) => console.log('FAILED: ' + f.name))
  process.exit(failed.length ? 1 : 0)
}

main()
  .catch((e) => { console.error('FATAL', e); killApp(); process.exit(2) })
  .finally(() => {
    if (appProc) killApp()
    killPhoneBrowser()
  })
