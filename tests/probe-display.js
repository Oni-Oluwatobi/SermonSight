/* Geometry probe: dumps presentation measurement metrics to diagnose pagination. */
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

const PROJ = path.resolve(__dirname, '..')
const PORT = 9347
const E2E = { email: 'ss-e2e-probe@sermonsight.test', pw: 'E2eProbe!234' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = (u) =>
  new Promise((res, rej) => {
    const req = http.get(u, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => {
        try { res(JSON.parse(d)) } catch (e) { rej(e) }
      })
    })
    req.on('error', rej)
    req.setTimeout(5000, () => req.destroy(new Error('timeout')))
  })

async function findPage(match) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json/list`)
      const t = list.find((x) => x.type === 'page' && match(x.url))
      if (t) return t
    } catch { /* booting */ }
    await sleep(500)
  }
  return null
}

async function cdpSession(wsUrl) {
  const { WebSocket } = require('ws')
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  return {
    send: (method, params = {}) =>
      new Promise((res) => {
        const i = ++id
        pending.set(i, res)
        ws.send(JSON.stringify({ id: i, method, params }))
      }),
    eval: async (expr) => {
      const r = await new Promise((res) => {
        const i = ++id
        pending.set(i, res)
        ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
      })
      return r.result?.result?.value
    },
    close: () => ws.close()
  }
}

async function main() {
  const app = spawn(
    path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['.', `--remote-debugging-port=${PORT}`],
    { cwd: PROJ, env: { ...process.env }, stdio: 'ignore', windowsHide: true }
  )
  console.log('app pid', app.pid)
  await sleep(4000)

  const op = await findPage((u) => !u.includes('window=presentation'))
  if (!op) throw new Error('operator page not found')
  const opS = await cdpSession(op.webSocketDebuggerUrl)
  await sleep(2500)
  const gate = await opS.eval(`!!document.querySelector('.auth-shell')`)
  console.log('gate visible:', gate)
  if (gate) {
    await opS.eval(`
      (() => {
        const set = (sel, v) => { const el = document.querySelector(sel); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
        set('.auth-input[type=email]', '${E2E.email}')
        set('.auth-input[type=password]', '${E2E.pw}')
        document.querySelector('.auth-submit').click()
        return true
      })()
    `)
    for (let i = 0; i < 30; i++) { if (await opS.eval(`!document.querySelector('.auth-shell')`)) break; await sleep(500) }
    console.log('signed in:', await opS.eval(`!document.querySelector('.auth-shell')`))
  }
  await opS.eval(`window.api.invoke('presentation:open')`)
  await sleep(2000)
  await opS.eval(`window.api.invoke('presentation:present', 'Psalm 118')`)
  await sleep(4000)

  const pres = await findPage((u) => u.includes('window=presentation'))
  if (!pres) throw new Error('presentation page not found')
  const ps = await cdpSession(pres.webSocketDebuggerUrl)
  await sleep(1500)

  const metrics = await ps.eval(`
    (() => {
      const box = document.querySelector('.pres-measure')
      const verses = document.querySelector('.pres-measure .pres-verses')
      const visVerses = document.querySelectorAll('.pres-body:not(.pres-measure) .pres-verse')
      const els = Array.from(verses?.children || [])
      const cs = getComputedStyle(els[0] || document.body)
      const body = document.querySelector('.pres-body:not(.pres-measure)')
      return {
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        boxClientH: box?.clientHeight,
        boxRectH: box?.getBoundingClientRect().height,
        padTop: box ? getComputedStyle(box).paddingTop : null,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        verseCount: els.length,
        visCount: visVerses.length,
        visBodyClientH: body?.clientHeight,
        first5: els.slice(0, 5).map(e => ({ t: e.offsetTop, h: e.offsetHeight })),
        last3: els.slice(-3).map(e => ({ t: e.offsetTop, h: e.offsetHeight })),
        verse0Top: els[0]?.offsetTop,
        refH: document.querySelector('.pres-measure .pres-ref')?.getBoundingClientRect().height,
        refAtTop: !!document.querySelector('.pres-measure .pres-ref')?.compareDocumentPosition(verses) & Node.DOCUMENT_POSITION_FOLLOWING,
        pagenum: document.querySelector('.pres-pagenum')?.textContent,
        visRange: visVerses.length ? { first: visVerses[0].offsetTop, last: visVerses[visVerses.length-1].offsetTop + visVerses[visVerses.length-1].offsetHeight } : null
      }
    })()
  `)
  console.log(JSON.stringify(metrics, null, 2))

  const state = await opS.eval(`window.api.invoke('state:get')`)
  console.log('main state.presentation:', JSON.stringify(state.presentation))
  console.log('live:', JSON.stringify({ ref: state.live?.reference, tr: state.live?.translation, n: state.live?.verses?.length, first: state.live?.verses?.[0]?.reference, last: state.live?.verses?.slice(-1)[0]?.reference }))
  const meas = await ps.eval(`Array.from(document.querySelectorAll('.pres-measure .pres-verse')).slice(0,3).map(e => e.textContent) + ' || vis: ' + Array.from(document.querySelectorAll('.pres-body:not(.pres-measure) .pres-verse')).map(e => e.textContent.slice(0,20))`)
  console.log('measurer first3:', meas)

  ps.close(); opS.close()
  app.kill()
  process.exit(0)
}

main().catch((e) => { console.error('PROBE FAIL', e); process.exit(1) })
