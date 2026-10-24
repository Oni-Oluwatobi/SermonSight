import type { FrameFeatures } from '../../shared/ipc'

/**
 * Lightweight energy-based voice activity detection.
 * Adaptive noise floor with onset smoothing and hangover — cheap enough
 * for low-end CPUs (O(1) per frame).
 */
export interface VadOptions {
  /** dB above noise floor required to count as speech */
  marginDb: number
  /** absolute floor (dBFS) below which nothing is speech */
  minDb: number
  /** consecutive frames required to enter speech */
  onsetFrames: number
  /** frames of silence tolerated before leaving speech */
  hangoverFrames: number
  /** noise floor adaptation speed (0..1), small = slower */
  noiseAlpha: number
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  marginDb: 9,
  minDb: -48,
  onsetFrames: 2,
  hangoverFrames: 3,
  noiseAlpha: 0.05
}

export interface VadResult {
  speech: boolean
  noiseFloorDb: number
}

export class VoiceActivityDetector {
  private noiseFloorDb = -60
  private onset = 0
  private hangover = 0
  private readonly opts: VadOptions

  constructor(opts: Partial<VadOptions> = {}) {
    this.opts = { ...DEFAULT_VAD_OPTIONS, ...opts }
    this.noiseFloorDb = this.opts.minDb - 6
  }

  reset(): void {
    this.noiseFloorDb = this.opts.minDb - 6
    this.onset = 0
    this.hangover = 0
  }

  update(f: FrameFeatures): VadResult {
    const db = f.db
    const threshold = Math.max(this.noiseFloorDb + this.opts.marginDb, this.opts.minDb)
    const above = db > threshold && db > this.opts.minDb

    if (above) {
      this.onset++
      this.hangover = this.opts.hangoverFrames
    } else {
      this.onset = 0
      if (this.hangover > 0) this.hangover--
    }

    // adapt noise floor only on non-speech frames
    if (!above) {
      const a = this.opts.noiseAlpha
      this.noiseFloorDb = this.noiseFloorDb * (1 - a) + db * a
      if (this.noiseFloorDb > -10) this.noiseFloorDb = -10
      if (this.noiseFloorDb < this.opts.minDb - 10) this.noiseFloorDb = this.opts.minDb - 10
    }

    const speech = this.onset >= this.opts.onsetFrames || this.hangover > 0
    return { speech, noiseFloorDb: this.noiseFloorDb }
  }
}
