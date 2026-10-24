/**
 * SermonSight STT worker (forked child process).
 * Runs vosk (offline) against 16 kHz PCM16 audio.
 * Kept out of the main process so heavy CPU work never blocks the UI and a
 * crash here cannot take down presentation.
 *
 * Protocol (parent -> child):
 *   { cmd: 'init', modelPath, sampleRate }
 *   { cmd: 'audio', data: Uint8Array }
 *   { cmd: 'flush' } | { cmd: 'pause' } | { cmd: 'resume' } | { cmd: 'stop' }
 * Protocol (child -> parent):
 *   { type: 'status', state, engine, message }
 *   { type: 'partial', text } | { type: 'final', text }
 */

import fs from 'fs'
import { createVoskEngine, type VoskEngine } from './voskLib'

interface WorkerMessage {
  cmd: 'init' | 'audio' | 'flush' | 'pause' | 'resume' | 'stop'
  modelPath?: string
  voskDllDir?: string
  sampleRate?: number
  data?: Uint8Array
}

let vosk: VoskEngine | null = null
let model: { handle: unknown } | null = null
let recognizer: { handle: unknown } | null = null
let lastPartial = ''
let lastPartialAt = 0
let initTried = false
/** Audio/flush arriving while the model is still loading — replayed once ready. */
const queuedAudio: Uint8Array[] = []
let queuedFlush = false
const MAX_QUEUED_CHUNKS = 100 // 100 x 100ms = 10s — longer backlogs garble recognition

function send(msg: Record<string, unknown>): void {
  try {
    process.send?.(msg)
  } catch {
    /* parent gone */
  }
}

/** JSON IPC turns Uint8Array into a numeric-key object — rebuild it. */
function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data
  if (Array.isArray(data)) return Uint8Array.from(data)
  if (data && typeof data === 'object') {
    const o = data as Record<string, number>
    const keys = Object.keys(o)
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      const out = new Uint8Array(keys.length)
      for (const k of keys) out[Number(k)] = o[k]
      return out
    }
  }
  return null
}

function status(state: string, message: string | null = null): void {
  send({ type: 'status', state, engine: 'vosk', message })
}

async function init(modelPath: string, sampleRate: number, dllDir: string): Promise<boolean> {
  if (initTried) return recognizer != null
  initTried = true
  const t0 = Date.now()
  try {
    if (!fs.existsSync(modelPath)) {
      status(
        'unavailable',
        `Offline speech model not found. Download "vosk-model-small-en-us-0.15" and place it at: ${modelPath}`
      )
      return false
    }
    vosk = createVoskEngine(dllDir)
    vosk.setLogLevel(-1)
    model = vosk.newModel(modelPath)
    recognizer = vosk.newRecognizer(model, sampleRate)
    send({ type: 'status', state: 'listening', engine: 'vosk', message: null, loadMs: Date.now() - t0 })
    replayQueued()
    return true
  } catch (err) {
    queuedAudio.length = 0
    queuedFlush = false
    const message = err instanceof Error ? err.message : String(err)
    status('unavailable', `Offline speech engine not installed (${message}). See README.`)
    return false
  }
}

/** Process audio/flush that arrived before the model finished loading. */
function replayQueued(): void {
  if (queuedFlush && queuedAudio.length === 0) {
    handleFlush()
    queuedFlush = false
    return
  }
  for (const chunk of queuedAudio) handleAudio(chunk)
  queuedAudio.length = 0
  if (queuedFlush) {
    queuedFlush = false
    handleFlush()
  }
}

function emitFinal(text: string): void {
  const t = text.trim()
  lastPartial = ''
  if (t) send({ type: 'final', text: t })
}

function handleAudio(data: Uint8Array): void {
  if (!vosk || !recognizer) return
  try {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    const done = vosk.acceptWaveform(recognizer, buf)
    if (done) {
      const res = vosk.finalResult(recognizer) as { text?: string }
      emitFinal(res?.text ?? '')
      return
    }
    const p = vosk.partialResult(recognizer)
    const text = String(p?.partial ?? '').trim()
    const now = Date.now()
    if (text && text !== lastPartial && now - lastPartialAt > 250) {
      lastPartial = text
      lastPartialAt = now
      send({ type: 'partial', text })
    }
  } catch (err) {
    send({ type: 'status', state: 'error', engine: 'vosk', message: String(err) })
  }
}

function handleFlush(): void {
  if (!vosk || !recognizer) return
  try {
    const res = vosk.finalResult(recognizer) as { text?: string }
    emitFinal(res?.text ?? '')
    vosk.reset(recognizer)
  } catch {
    /* ignore */
  }
}

process.on('message', (raw: unknown) => {
  const msg = raw as WorkerMessage
  if (!msg || typeof msg !== 'object') return
  switch (msg.cmd) {
    case 'init':
      void init(msg.modelPath ?? '', msg.sampleRate ?? 16000, msg.voskDllDir ?? '')
      break
    case 'audio': {
      const bytes = toBytes(msg.data)
      if (!bytes) break
      if (!recognizer) {
        // Model still loading — hold audio instead of silently dropping it.
        if (queuedAudio.length < MAX_QUEUED_CHUNKS) queuedAudio.push(bytes)
        break
      }
      handleAudio(bytes)
      break
    }
    case 'flush':
      if (!recognizer) {
        queuedFlush = true
        break
      }
      handleFlush()
      break
    case 'pause':
      try {
        if (vosk && recognizer) vosk.reset(recognizer)
      } catch {
        /* ignore */
      }
      status('paused', null)
      break
    case 'resume':
      status(recognizer ? 'listening' : 'unavailable', recognizer ? null : 'Engine unavailable')
      break
    case 'stop':
      try {
        if (vosk && recognizer) vosk.freeRecognizer(recognizer)
        if (vosk && model) vosk.freeModel(model)
      } catch {
        /* ignore */
      }
      process.exit(0)
      break
  }
})

process.on('uncaughtException', (err) => {
  send({ type: 'status', state: 'error', engine: 'vosk', message: String(err) })
  // Exit so the parent's bounded restart logic can fork a clean worker.
  process.exit(1)
})

send({ type: 'status', state: 'starting', engine: 'vosk', message: null })
