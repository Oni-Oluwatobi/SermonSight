import type { FrameFeatures } from '../../shared/ipc'
import { VoiceActivityDetector, type VadOptions } from './VoiceActivityDetector'

export type AudioState = 'idle' | 'silence' | 'speech' | 'music' | 'mixed' | 'error'

export interface ClassifierOptions extends Partial<VadOptions> {
  /** frames in the rolling analysis window (~100ms each) */
  windowFrames?: number
  /** energetic frames required to consider the source "sustained" */
  sustainedFrames?: number
  /** max speech frames inside a sustained window before it stops counting as music-only */
  maxMusicSpeechFrames?: number
  /** music context decay after the last sustained evidence (frames) */
  musicContextFrames?: number
}

export const AUDIO_LABELS: Record<AudioState, string> = {
  idle: 'Not listening',
  silence: 'No speech detected',
  speech: 'Voice detected — listening',
  music: 'Instrumental detected — listening paused',
  mixed: 'Music + voice detected',
  error: 'Audio input error'
}

/**
 * Deterministic, lightweight audio classification:
 * silence / speech / instrumental / mixed.
 * DSP features are computed by the audio worklet; this class only runs a
 * small state machine, so it stays cheap on low-end CPUs.
 */
export class AudioClassifier {
  private readonly vad: VoiceActivityDetector
  private readonly windowFrames: number
  private readonly sustainedFrames: number
  private readonly maxMusicSpeechFrames: number
  private readonly musicContextFrames: number

  private state: AudioState = 'idle'
  private energy: boolean[] = []
  private speechFlags: boolean[] = []
  private musicContext = 0
  private error: string | null = null

  constructor(opts: ClassifierOptions = {}) {
    this.vad = new VoiceActivityDetector(opts)
    this.windowFrames = opts.windowFrames ?? 10
    this.sustainedFrames = opts.sustainedFrames ?? 8
    this.maxMusicSpeechFrames = opts.maxMusicSpeechFrames ?? 4
    this.musicContextFrames = opts.musicContextFrames ?? 20
  }

  reset(): void {
    this.vad.reset()
    this.energy = []
    this.speechFlags = []
    this.musicContext = 0
    this.state = 'idle'
    this.error = null
  }

  setError(message: string | null): void {
    if (message) {
      this.state = 'error'
      this.error = message
    } else if (this.state === 'error') {
      this.state = 'idle'
      this.error = null
    }
  }

  getError(): string | null {
    return this.error
  }

  getState(): AudioState {
    return this.state
  }

  /** PCM should be forwarded to the STT engine only for these states. */
  static feedsStt(state: AudioState): boolean {
    return state === 'speech' || state === 'mixed'
  }

  update(f: FrameFeatures): AudioState {
    const vad = this.vad.update(f)
    const energetic = f.db > vad.noiseFloorDb + 6

    this.energy.push(energetic)
    this.speechFlags.push(vad.speech)
    if (this.energy.length > this.windowFrames) this.energy.shift()
    if (this.speechFlags.length > this.windowFrames) this.speechFlags.shift()

    const energeticCount = this.energy.reduce((n, e) => n + (e ? 1 : 0), 0)
    const speechCount = this.speechFlags.reduce((n, e) => n + (e ? 1 : 0), 0)
    const sustained =
      this.energy.length >= this.windowFrames &&
      energeticCount >= this.sustainedFrames &&
      speechCount <= this.maxMusicSpeechFrames

    if (sustained) this.musicContext = this.musicContextFrames
    else if (this.musicContext > 0) this.musicContext--

    if (vad.speech) {
      this.state = this.musicContext > 0 ? 'mixed' : 'speech'
    } else if (sustained || this.musicContext > 0) {
      this.state = 'music'
    } else {
      this.state = 'silence'
    }
    return this.state
  }
}
