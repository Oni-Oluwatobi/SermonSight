/* Koffi binding for official libvosk.dll (vosk npm's ffi/ref stack cannot load in Electron).
   Mirrors the vosk npm API surface used by sttWorker.
   Run under RUN_AS_NODE: electron.exe tools\vosk-koffi-smoke.js */
const path = require('path')
const fs = require('fs')

const koffi = require('koffi')

function loadLib(dllDir) {
  const dll = path.join(dllDir, 'libvosk.dll')
  if (!fs.existsSync(dll)) throw new Error('libvosk.dll not found at ' + dll)
  const lib = koffi.load(dll)
  return {
    setLogLevel: lib.func('vosk_set_log_level', 'void', ['int']),
    modelNew: lib.func('vosk_model_new', 'void*', ['char*']),
    modelFree: lib.func('vosk_model_free', 'void', ['void*']),
    recNew: lib.func('vosk_recognizer_new', 'void*', ['void*', 'float']),
    recFree: lib.func('vosk_recognizer_free', 'void', ['void*']),
    accept: lib.func('vosk_recognizer_accept_waveform', 'bool', ['void*', 'void*', 'int']),
    result: lib.func('vosk_recognizer_final_result', 'char*', ['void*']),
    partial: lib.func('vosk_recognizer_partial_result', 'char*', ['void*']),
    reset: lib.func('vosk_recognizer_reset', 'void', ['void*'])
  }
}

function readPcm16k(file) {
  const b = fs.readFileSync(file)
  let pos = 12
  let fmt = null
  let data = null
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
    const p = i * ratio
    const i0 = Math.floor(p)
    const v = mono[i0] + (mono[Math.min(i0 + 1, mono.length - 1)] - mono[i0]) * (p - i0)
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)))
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
}

function main() {
  const dllDir = process.argv[2] || path.join(__dirname, '..', 'vendor', 'vosk')
  const modelDir = process.argv[3] || path.join(__dirname, '..', 'models', 'vosk-model-small-en-us-0.15')
  const wav = process.env['TEMP'] + '\\opencode\\ss-probe\\tts.wav'
  console.log('runtime=' + (process.versions.electron ? 'electron-' + process.versions.electron : 'node-' + process.versions.node))
  const api = loadLib(dllDir)
  api.setLogLevel(-1)
  const model = api.modelNew(modelDir)
  if (!model) throw new Error('model load returned null')
  const rec = api.recNew(model, 16000)
  if (!rec) throw new Error('recognizer null')
  const pcm = readPcm16k(wav)
  for (let i = 0; i < pcm.length; i += 3200) {
    const chunk = pcm.subarray(i, Math.min(i + 3200, pcm.length))
    api.accept(rec, chunk, chunk.length)
  }
  const text = (api.result(rec) || '').trim()
  api.reset(rec)
  api.recFree(rec)
  api.modelFree(model)
  console.log('TRANSCRIPT: ' + JSON.stringify(text))
  if (!text) process.exit(3)
  process.exit(0)
}

try {
  main()
} catch (e) {
  console.log('FAIL: ' + (e && e.message ? e.message : e))
  process.exit(1)
}
