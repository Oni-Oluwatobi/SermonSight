/* Focused STT probe: mic start -> listening -> mic stop -> TTS feed -> transcript + main log tail. */
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const PROJ = path.resolve(__dirname, '..')
const PORT = 9349
const TTS_WAV = path.join(process.env.TEMP, 'opencode', 'ss-probe', 'tts.wav')
const LOG = path.join(process.env.APPDATA, 'SermonSight', 'logs', 'sermonsight-' + new Date().toISOString().slice(0, 10) + '.log')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = (u) => new Promise((res, rej) => { const req = http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }); req.on('error', rej) })

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
  const app = spawn(path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${PORT}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], { cwd: PROJ, stdio: 'ignore', windowsHide: true, env: { ...process.env, SERMONSIGHT_STT_PRIORITY: 'high' } })
  console.log('pid', app.pid)
  let target
  for (let i = 0; i < 40; i++) { try { const l = await getJson(`http://127.0.0.1:${PORT}/json/list`); target = l.find((t) => t.type === 'page'); if (target) break } catch {} await sleep(500) }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0; const pend = new Map()
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  const ev = async (expr) => {
    const r = await new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })) })
    if (r.result?.exceptionDetails) return 'EXC ' + (r.result.exceptionDetails.exception?.description || '')
    return r.result?.result?.value
  }
  await sleep(3500)
  // sign in if gate
  if (await ev(`!!document.getElementById('auth-email')`)) {
    await ev(`(() => { const set=(id,v)=>{const el=document.getElementById(id);const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('auth-email','ss-e2e-probe@sermonsight.test');set('auth-password','E2eProbe!234'); })()`)
    await ev(`document.querySelector('.auth-submit').click()`)
    for (let i = 0; i < 30; i++) { if (await ev(`!!document.querySelector('.app')`)) break; await sleep(500) }
    console.log('signed in')
  }
  const t0 = Date.now()
  const logTail = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => /stt |audio |mic toggle/.test(l)).slice(-50).join('\n') } catch (e) { return 'nolog ' + e } }
  let micFound = false
  for (let i = 0; i < 25; i++) {
    await ev(`[...document.querySelectorAll('button')].find(b => /Sermon/i.test(b.textContent) && b.textContent.length < 20)?.click()`)
    micFound = await ev(`!![...document.querySelectorAll('button')].find(b => /Start microphone/i.test(b.textContent))`)
    if (micFound) break
    await sleep(400)
  }
  console.log('mic button found:', micFound)
  if (micFound) await ev(`[...document.querySelectorAll('button')].find(b => /Start microphone/i.test(b.textContent))?.click()`)
  let st = ''
  for (let i = 0; i < 90; i++) { const s = await ev(`window.api.invoke('state:get')`); st = s.stt.state; if (st === 'listening') break; await sleep(600) }
  console.log(`+${Date.now() - t0}ms state=${st}`)
  await ev(`[...document.querySelectorAll('button')].find(b => /Stop microphone/i.test(b.textContent))?.click()`)
  for (let i = 0; i < 15; i++) { const s = await ev(`window.api.invoke('state:get')`); if (s.stt.state === 'paused') { console.log('paused'); break } await sleep(400) }
  const pcm = readPcm16k(TTS_WAV)
  const b64 = pcm.toString('base64')
  console.log(`pcm bytes=${pcm.length}`)
  await ev(`(() => {
    const bin = atob(${JSON.stringify(b64)})
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    for (let i = 0; i < bytes.length; i += 3200) {
      window.api.send('audio:stream', { type: 'pcm', data: bytes.subarray(i, Math.min(i + 3200, bytes.length)) })
    }
    window.api.send('audio:stream', { type: 'flush' })
    return true
  })()`)
  await sleep(8000)
  const s = await ev(`window.api.invoke('state:get')`)
  console.log('stt:', JSON.stringify(s.stt))
  console.log('candidates:', JSON.stringify({ last: s.candidates.lastTranscript, n: s.candidates.candidates.length, c0: s.candidates.candidates[0]?.reference }))
  console.log('--- log tail ---')
  console.log(logTail())
  ws.close(); app.kill()
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
