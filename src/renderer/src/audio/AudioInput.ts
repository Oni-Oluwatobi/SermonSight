import { AudioClassifier, AUDIO_LABELS, type AudioState } from '@core/audio/AudioClassifier'
import { computeFeatures } from '@core/audio/features'
import { IPC } from '@shared/ipc'
import { setAudioStatus } from '../state/store'

/**
 * Microphone capture pipeline (renderer):
 *   getUserMedia -> AudioWorklet (100ms frames) -> feature extraction
 *   -> VAD/audio classification -> PCM16 @16kHz feed to the offline STT host.
 */

const WORKLET_NAME = 'ss-capture'

const WORKLET_SOURCE = `
class SermonSightCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frameLen = Math.round(sampleRate / 10)
    this.buf = new Float32Array(this.frameLen)
    this.len = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel) return true
    let i = 0
    while (i < channel.length) {
      const take = Math.min(this.frameLen - this.len, channel.length - i)
      this.buf.set(channel.subarray(i, i + take), this.len)
      this.len += take
      i += take
      if (this.len >= this.frameLen) {
        this.port.postMessage(this.buf.slice(0))
        this.len = 0
      }
    }
    return true
  }
}
registerProcessor('ss-capture', SermonSightCapture)
`

interface DsState {
  nextOut: number
}

/** Linear-interpolating resampler with carry across frames. */
function downsampleTo16k(frame: Float32Array, inRate: number, ds: DsState): Int16Array {
  if (inRate === 16000) {
    const out = new Int16Array(frame.length)
    for (let i = 0; i < frame.length; i++) {
      const s = Math.max(-1, Math.min(1, frame[i]))
      out[i] = s * 32767
    }
    ds.nextOut = 0
    return out
  }
  const ratio = inRate / 16000
  const maxOut = Math.ceil((frame.length - ds.nextOut) / ratio) + 2
  const out = new Int16Array(maxOut)
  let n = 0
  let pos = ds.nextOut
  while (pos < frame.length && n < maxOut) {
    const i = Math.floor(pos)
    const frac = pos - i
    const s0 = frame[i]
    const s1 = frame[Math.min(i + 1, frame.length - 1)]
    const s = s0 + (s1 - s0) * frac
    const clamped = Math.max(-1, Math.min(1, s))
    out[n++] = clamped * 32767
    pos += ratio
  }
  ds.nextOut = pos - frame.length
  return out.subarray(0, n)
}

export class AudioInput {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private classifier = new AudioClassifier()
  private ds: DsState = { nextOut: 0 }
  private wasFeeding = false
  private running = false
  private workletUrl: string | null = null
  /** Last few non-speech PCM chunks, prepended when speech starts so the VAD
   *  onset delay (2 frames ≈ 200ms) never clips the first word of a reference. */
  private preRoll: Uint8Array[] = []
  private static readonly PRE_ROLL_MAX = 5

  isRunning(): boolean {
    return this.running
  }

  getState(): AudioState {
    return this.classifier.getState()
  }

  async start(): Promise<void> {
    if (this.running) return
    setAudioStatus({ state: 'idle', label: 'Requesting microphone permission…', listening: false, error: null })

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })
    } catch (err) {
      const denied = err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      const missing = err instanceof Error && err.name === 'NotFoundError'
      const message = denied
        ? 'Microphone permission denied. Allow microphone access for SermonSight and try again.'
        : missing
          ? 'No microphone found. Check your audio input device.'
          : 'Microphone unavailable. Check your audio input device.'
      setAudioStatus({ state: 'error', label: denied ? 'Microphone permission denied' : AUDIO_LABELS.error, listening: false, error: message })
      throw new Error(message)
    }

    try {
      const ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
      this.workletUrl = URL.createObjectURL(blob)
      await ctx.audioWorklet.addModule(this.workletUrl)

      const source = ctx.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(ctx, WORKLET_NAME)
      node.port.onmessage = (e: MessageEvent) => this.onFrame(e.data as Float32Array, ctx.sampleRate)
      source.connect(node)

      this.ctx = ctx
      this.stream = stream
      this.node = node
    this.classifier.reset()
    this.ds = { nextOut: 0 }
    this.preRoll = []
    this.wasFeeding = false
    this.running = true
      setAudioStatus({
        state: 'silence',
        label: AUDIO_LABELS.silence,
        listening: true,
        level: 0,
        error: null
      })
      window.api.send(IPC.AUDIO_STREAM, { type: 'status', listening: true, error: null })
    } catch (err) {
      this.teardown()
      const message = 'Audio engine failed to start.'
      setAudioStatus({ state: 'error', label: AUDIO_LABELS.error, listening: false, error: message })
      throw new Error(message)
    }
  }

  stop(): void {
    this.teardown()
    window.api.send(IPC.AUDIO_STREAM, { type: 'status', listening: false, error: null })
    setAudioStatus({
      state: 'idle',
      label: AUDIO_LABELS.idle,
      listening: false,
      level: 0,
      error: null
    })
  }

  private teardown(): void {
    this.running = false
    this.wasFeeding = false
    this.preRoll = []
    try {
      this.node?.disconnect()
    } catch {
      /* ignore */
    }
    this.node = null
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop()
      this.stream = null
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl)
      this.workletUrl = null
    }
    this.classifier.reset()
  }

  private onFrame(frame: Float32Array, sampleRate: number): void {
    if (!this.running || frame.length === 0) return
    try {
      const features = computeFeatures(frame, sampleRate, performance.now())
      const state = this.classifier.update(features)
      const level = Math.min(1, Math.max(0, (features.db + 60) / 60))
      setAudioStatus({ state, label: AUDIO_LABELS[state], level })

      const pcm = downsampleTo16k(frame, sampleRate, this.ds)
      const bytes =
        pcm.length > 0 ? new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength) : null

      if (AudioClassifier.feedsStt(state)) {
        if (!this.wasFeeding && this.preRoll.length > 0) {
          // Speech just started: prepend the pre-roll so the onset delay
          // never clips the first word ("John 3:16" → "ohn 3:16").
          for (const chunk of this.preRoll) {
            window.api.send(IPC.AUDIO_STREAM, { type: 'pcm', data: chunk })
          }
          this.preRoll = []
        }
        if (bytes) {
          window.api.send(IPC.AUDIO_STREAM, { type: 'pcm', data: bytes })
        }
        this.wasFeeding = true
      } else {
        if (this.wasFeeding) {
          // speech ended (silence or music) — finalize the utterance
          window.api.send(IPC.AUDIO_STREAM, { type: 'flush' })
          this.wasFeeding = false
        }
        if (bytes) {
          this.preRoll.push(bytes)
          if (this.preRoll.length > AudioInput.PRE_ROLL_MAX) this.preRoll.shift()
        }
      }
    } catch {
      // frame processing must never break capture
    }
  }
}

export const audioInput = new AudioInput()
