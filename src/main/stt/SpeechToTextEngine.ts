import type { SttState } from '../../shared/ipc'

/**
 * Offline speech-to-text engine interface.
 * The provider is swappable (vosk today, another local engine later).
 * No cloud, no network — ever.
 */
export interface SttEvent {
  type: 'status' | 'partial' | 'final'
  text?: string
  state?: SttState
  engine?: string
  message?: string | null
}

export interface SpeechToTextEngine {
  start(): void
  stop(): void
  pause(): void
  resume(): void
  /** 16 kHz little-endian mono PCM16 frames */
  feed(audio: Uint8Array): void
  /** Finalize the current utterance and emit a final transcript */
  flush(): void
  onEvent(cb: (e: SttEvent) => void): void
  status(): { state: SttState; engine: string; message: string | null }
}
