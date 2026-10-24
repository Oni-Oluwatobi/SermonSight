/* Drive out/main/sttWorker.js directly: init -> audio(chunks) -> flush -> print events. */
const { fork } = require('child_process')
const path = require('path')
const fs = require('fs')
const PROJ = path.resolve(__dirname, '..')
const TTS_WAV = path.join(process.env.TEMP, 'opencode', 'ss-probe', 'tts.wav')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  const modelPath = path.join(PROJ, 'models', 'vosk-model-small-en-us-0.15')
  const dllDir = path.join(PROJ, 'vendor', 'vosk')
  const mode = process.argv[2] || 'normal' // normal | queued (flush+audio before ready)
  const w = fork(path.join(PROJ, 'out', 'main', 'sttWorker.js'), [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    serialization: 'advanced',
    cwd: PROJ
  })
  const t0 = Date.now()
  const ts = () => `+${Date.now() - t0}ms`
  w.on('message', (m) => console.log(ts(), JSON.stringify(m)))
  const pcm = readPcm16k(TTS_WAV)
  console.log(ts(), `mode=${mode} pcm=${pcm.length}`)

  if (mode === 'queued') {
    // fire everything immediately (model still loading) — mirrors e2e contention
    w.send({ cmd: 'init', modelPath, voskDllDir: dllDir, sampleRate: 16000 })
    for (let i = 0; i < pcm.length; i += 3200) w.send({ cmd: 'audio', data: pcm.subarray(i, Math.min(i + 3200, pcm.length)) })
    w.send({ cmd: 'flush' })
    await sleep(8000)
    console.log(ts(), 'DONE')
    w.kill(); process.exit(0)
  }

  w.send({ cmd: 'init', modelPath, voskDllDir: dllDir, sampleRate: 16000 })
  // wait for listening
  await new Promise((res) => {
    const h = (m) => { if (m.type === 'status' && m.state === 'listening') { w.off('message', h); res() } }
    w.on('message', h)
  })
  console.log(ts(), 'ready — simulating mic stop (pause) then feed')
  w.send({ cmd: 'pause' })
  await sleep(300)
  for (let i = 0; i < pcm.length; i += 3200) { w.send({ cmd: 'audio', data: pcm.subarray(i, Math.min(i + 3200, pcm.length)) }); await sleep(10) }
  w.send({ cmd: 'flush' })
  await sleep(5000)
  console.log(ts(), 'DONE')
  w.kill(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
