/* Vosk smoke test under Electron: load model, feed TTS speech, print transcript.
   Run: tools\tts.ps1  then  electron.exe tools\stt-smoke.js */
const fs = require('fs')
const path = require('path')

const WAV = process.env['TEMP'] + '\\opencode\\ss-probe\\tts.wav'
const MODEL = path.join(__dirname, '..', 'models', 'vosk-model-small-en-us-0.15')

function readWavPcm16(file) {
  const b = fs.readFileSync(file)
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a wav')
  let pos = 12
  let fmt = null
  let data = null
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4)
    const size = b.readUInt32LE(pos + 4)
    if (id === 'fmt ')
      fmt = {
        channels: b.readUInt16LE(pos + 10),
        rate: b.readUInt32LE(pos + 12),
        bits: b.readUInt16LE(pos + 22)
      }
    if (id === 'data') data = b.subarray(pos + 8, pos + 8 + size)
    pos += 8 + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('bad wav chunks')
  if (fmt.bits !== 16) throw new Error('need 16-bit wav, got ' + fmt.bits)
  const mono = []
  const step = fmt.channels
  for (let i = 0; i + 1 < data.length; i += 2 * step) mono.push(data.readInt16LE(i))
  // linear resample to 16k
  const ratio = fmt.rate / 16000
  const out = new Int16Array(Math.floor(mono.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const p = i * ratio
    const i0 = Math.floor(p)
    const i1 = Math.min(i0 + 1, mono.length - 1)
    const v = mono[i0] + (mono[i1] - mono[i0]) * (p - i0)
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)))
  }
  return out
}

async function main() {
  if (!fs.existsSync(WAV)) {
    console.log('NO_WAV at ' + WAV)
    process.exit(2)
  }
  if (!fs.existsSync(MODEL)) {
    console.log('NO_MODEL at ' + MODEL)
    process.exit(2)
  }
  const vosk = require('vosk')
  vosk.setLogLevel(-1)
  console.log('vosk loaded')
  const t0 = Date.now()
  const model = new vosk.Model(MODEL)
  const rec = new vosk.Recognizer({ model, sampleRate: 16000 })
  console.log('model+recognizer ready in ' + (Date.now() - t0) + 'ms')
  const pcm = readWavPcm16(WAV)
  console.log('pcm samples=' + pcm.length + ' (' + (pcm.length / 16000).toFixed(1) + 's)')
  const bytes = Buffer.alloc(pcm.length * 2)
  for (let i = 0; i < pcm.length; i++) bytes.writeInt16LE(pcm[i], i * 2)
  const CHUNK = 3200 // 100ms
  const t1 = Date.now()
  for (let i = 0; i < bytes.length; i += CHUNK) {
    rec.acceptWaveform(bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))
  }
  const res = rec.finalResult()
  console.log('processed in ' + (Date.now() - t1) + 'ms')
  console.log('TRANSCRIPT: ' + JSON.stringify((res.text || '').trim()))
  rec.delete()
  model.delete()
  process.exit(0)
}

main().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
