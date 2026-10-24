/* Fill repro: launch, gate, exact fill from e2e, print diagnostics. */
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const PROJ = path.resolve(__dirname, '..')
const PORT = 9348
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = (u) => new Promise((res, rej) => { const req = http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }); req.on('error', rej) })

async function main() {
  const { WebSocket } = require('ws')
  const app = spawn(path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${PORT}`], { cwd: PROJ, stdio: 'ignore', windowsHide: true })
  console.log('pid', app.pid)
  let target
  for (let i = 0; i < 40; i++) {
    try { const l = await getJson(`http://127.0.0.1:${PORT}/json/list`); target = l.find((t) => t.type === 'page'); if (target) break } catch {}
    await sleep(500)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0; const pend = new Map(); const events = []
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') events.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300))
    if (m.method === 'Runtime.consoleAPICalled') events.push('LOG ' + m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300))
  })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  ws.send(JSON.stringify({ id: ++id, method: 'Runtime.enable' }))
  const ev = async (expr) => {
    const r = await new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })) })
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails))
    return r.result?.result?.value
  }
  console.log('target url:', target.url)
  for (let t = 0; t < 6; t++) {
    await sleep(2500)
    const snap = await ev(`JSON.stringify({
      app: !!document.querySelector('.app'),
      loading: !!document.querySelector('.auth-loading'),
      card: !!document.querySelector('.auth-card'),
      email: !!document.getElementById('auth-email'),
      bodyLen: document.body?.innerHTML.length || 0,
      title: document.title
    })`)
    console.log(`t=${(t + 1) * 2.5}s`, snap)
    if (snap && snap.includes('"email":true')) break
  }
  console.log('events:', events.length ? events.join('\n') : '(none)')
  console.log('card:', await ev(`!!document.querySelector('.auth-card')`))
  console.log('input by id:', await ev(`!!document.getElementById('auth-email')`))
  console.log('input by sel:', await ev(`!!document.querySelector('.auth-input[type=email]')`))
  const diag = await ev(`(() => {
    const el = document.getElementById('auth-email')
    if (!el) return 'EL NULL; inputs=' + document.querySelectorAll('input').length
    try {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      s.call(el, 'x@y.z')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return 'OK value=' + el.value
    } catch (e) { return 'THROW ' + e }
  })()`)
  console.log('fill:', diag)
  ws.close()
  app.kill()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
