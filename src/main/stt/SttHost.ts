import { app } from 'electron'
import { fork, spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { SttState } from '../../shared/ipc'
import type { SpeechToTextEngine, SttEvent } from './SpeechToTextEngine'
import { logger } from '../logger'

const ENGINE = 'vosk'
const AUTO_FLUSH_MS = 1100

function defaultModelPath(): string {
  const configured = process.env['SERMONSIGHT_VOSK_MODEL']
  if (configured) return configured
  const name = 'vosk-model-small-en-us-0.15'
  if (app.isPackaged) return path.join(process.resourcesPath, 'models', name)
  return path.join(app.getAppPath(), 'models', name)
}

function defaultDllDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'vosk')
  return path.join(app.getAppPath(), 'vendor', 'vosk')
}

function workerPath(): string {
  return path.join(__dirname, 'sttWorker.js')
}

/**
 * Manages the forked STT worker: lifecycle, audio feed, auto-endpointing.
 * Any failure degrades to a clear status — never crashes the app.
 */
export class SttHost implements SpeechToTextEngine {
  private child: ChildProcess | null = null
  private listeners: ((e: SttEvent) => void)[] = []
  private state: SttState = 'unavailable'
  private message: string | null = 'Speech engine not started'
  private lastFeedAt = 0
  private pendingAudio = false
  private wantRunning = false
  private flushTimer: NodeJS.Timeout | null = null
  /** True once the worker reported the model is loaded (only source of 'listening'). */
  private workerReady = false
  /** Mic was turned off while the model was still loading — re-assert 'pause'
   *  the moment the worker reports ready, instead of accepting its 'listening'. */
  private pauseRequested = false
  /** Audio/flush held in the MAIN process while the model loads — the worker
   *  receives only init, so its model load is never slowed by message floods.
   *  Capped at ~10s of audio: replaying a longer backlog after load produces
   *  garbled transcripts (the recognizer is drowned in a burst of old speech). */
  private loadQueue: Uint8Array[] = []
  private loadFlush = false
  private static readonly MAX_LOAD_QUEUE = 100 // 100 x 100ms = 10s
  /** Automatic crash recovery: bounded exponential backoff (1s/2s/4s). */
  private restartAttempts = 0
  private restartTimer: NodeJS.Timeout | null = null
  private static readonly MAX_RESTARTS = 3

  onEvent(cb: (e: SttEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: SttEvent): void {
    for (const cb of this.listeners) {
      try {
        cb(e)
      } catch (err) {
        logger.error('stt listener error', String(err))
      }
    }
  }

  private setState(state: SttState, message: string | null): void {
    if (this.state === state && this.message === message) return
    this.state = state
    this.message = message
    this.emit({ type: 'status', state, engine: ENGINE, message })
    logger.info('stt status', { state, message, pid: process.pid })
  }

  status(): { state: SttState; engine: string; message: string | null } {
    return { state: this.state, engine: ENGINE, message: this.message }
  }

  start(): void {
    if (this.child) {
      // Mic came back on while the worker is alive but paused — resume it.
      if (this.state === 'paused') {
        this.resume()
        return
      }
      // Worker reported an error but is still alive — replace it with a fresh one.
      if (this.state === 'error') {
        const old = this.child
        this.child = null
        try {
          old.removeAllListeners('exit')
          old.kill()
        } catch {
          /* ignore */
        }
      } else {
        return
      }
    }
    this.clearRestartTimer()
    this.wantRunning = true
    this.workerReady = false
    this.pauseRequested = false
    this.loadQueue.length = 0
    this.loadFlush = false
    this.setState('starting', null)
    try {
      const child = fork(workerPath(), [], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env },
        // JSON IPC would mangle Uint8Array audio into a plain object (data.buffer
        // undefined -> Buffer.from throws); advanced uses structured clone.
        serialization: 'advanced'
      })
      this.child = child
      this.lowerWorkerPriority(child.pid)
      child.on('message', (raw: unknown) => this.handleMessage(raw))
      child.on('error', (err) => {
        logger.error('stt worker error', String(err))
        this.setState('error', `Speech engine failed: ${err.message}`)
      })
      child.on('exit', (code, signal) => {
        logger.warn('stt worker exited', { code, signal })
        this.child = null
        this.pendingAudio = false
        this.workerReady = false
        this.loadQueue.length = 0
        this.loadFlush = false
        if (this.wantRunning) {
          this.setState('error', 'Speech engine stopped unexpectedly.')
          this.scheduleRestart(`exit code=${code} signal=${signal ?? 'none'}`)
        }
      })
      child.send({
        cmd: 'init',
        modelPath: defaultModelPath(),
        voskDllDir: defaultDllDir(),
        sampleRate: 16000
      })
      this.startFlushTimer()
    } catch (err) {
      this.child = null
      this.setState('error', `Could not start speech engine: ${String(err)}`)
    }
  }

  /**
   * Bounded crash recovery: 1s → 2s → 4s, then stop trying (the UI tells the
   * operator to toggle the microphone). A successful 'listening' resets the
   * counter, so a rare crash never permanently disables the engine.
   */
  private scheduleRestart(reason: string): void {
    if (!this.wantRunning) return
    if (this.restartAttempts >= SttHost.MAX_RESTARTS) {
      logger.error('stt restart gave up', { reason, attempts: this.restartAttempts })
      this.setState(
        'error',
        'Speech engine stopped unexpectedly. Turn the microphone off and on to retry.'
      )
      return
    }
    const delay = 1000 * Math.pow(2, this.restartAttempts)
    this.restartAttempts++
    logger.warn('stt restart scheduled', { reason, delay, attempt: this.restartAttempts })
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.wantRunning || this.child) return
      this.start()
    }, delay)
    this.restartTimer.unref?.()
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  stop(): void {
    this.wantRunning = false
    this.workerReady = false
    this.pauseRequested = false
    this.restartAttempts = 0
    this.clearRestartTimer()
    this.stopFlushTimer()
    const child = this.child
    this.child = null
    this.pendingAudio = false
    if (child) {
      try {
        child.send({ cmd: 'stop' })
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill()
        } catch {
          /* ignore */
        }
      }, 1500)
    }
    this.setState('unavailable', 'Speech engine stopped')
  }

  pause(): void {
    if (!this.child) return
    // During model load the worker acknowledges 'pause' but then reports its
    // unconditional post-load 'listening' — remember the request so the handler
    // can re-assert pause instead of accepting a state the mic doesn't have.
    this.pauseRequested = !this.workerReady
    if (this.pauseRequested) {
      this.loadQueue.length = 0
      this.loadFlush = false
      this.pendingAudio = false
    }
    try {
      this.child.send({ cmd: 'pause' })
    } catch {
      /* ignore */
    }
    this.setState('paused', null)
  }

  resume(): void {
    if (!this.child) {
      this.start()
      return
    }
    // Mic is on again — cancel any pending pause re-assert from a load-time pause.
    this.pauseRequested = false
    // Model still loading: the worker reports 'listening' when it is ready;
    // claiming it here would lie about the engine state.
    if (!this.workerReady) return
    try {
      this.child.send({ cmd: 'resume' })
    } catch {
      /* ignore */
    }
    this.setState('listening', null)
  }

  feed(audio: Uint8Array): void {
    if (!this.child) return
    if (this.state !== 'listening' && this.state !== 'paused' && this.state !== 'starting') return
    if (!this.workerReady) {
      // Model still loading — buffer here (bounded), keep the worker's IPC channel
      // clean so its load runs at full speed.
      if (this.loadQueue.length >= SttHost.MAX_LOAD_QUEUE) this.loadQueue.shift()
      this.loadQueue.push(audio)
      this.lastFeedAt = Date.now()
      this.pendingAudio = true
      return
    }
    // Only claim 'listening' once the worker actually has the model loaded.
    if (this.state === 'paused') this.setState('listening', null)
    try {
      this.child.send({ cmd: 'audio', data: Buffer.from(audio) })
      this.lastFeedAt = Date.now()
      this.pendingAudio = true
    } catch (err) {
      logger.warn('stt feed failed', String(err))
    }
  }

  flush(): void {
    if (!this.child) return
    this.pendingAudio = false
    if (!this.workerReady) {
      this.loadFlush = true
      return
    }
    try {
      this.child.send({ cmd: 'flush' })
    } catch {
      /* ignore */
    }
  }

  /** Model ready: replay anything buffered during load, then normal flow. */
  private replayLoadQueue(): void {
    const queued = this.loadQueue
    const flush = this.loadFlush
    this.loadQueue = []
    this.loadFlush = false
    if (!this.child || (queued.length === 0 && !flush)) return
    for (const chunk of queued) {
      try {
        this.child.send({ cmd: 'audio', data: Buffer.from(chunk) })
      } catch {
        break
      }
    }
    if (flush) {
      try {
        this.child.send({ cmd: 'flush' })
      } catch {
        /* ignore */
      }
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => {
      if (this.pendingAudio && Date.now() - this.lastFeedAt > AUTO_FLUSH_MS) {
        this.flush()
      }
    }, 400)
    this.flushTimer.unref?.()
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * Run the (CPU-heavy) speech worker at BelowNormal priority on Windows so that
   * recognition can never monopolize a low-end CPU and freeze the UI or playback.
   * SERMONSIGHT_STT_PRIORITY=normal|high|idle overrides (BelowNormal starves the
   * worker on heavily loaded machines; tests run it at high).
   * Fire-and-forget; failure only means default priority.
   */
  private lowerWorkerPriority(pid: number | undefined): void {
    if (process.platform !== 'win32' || !pid) return
    const want = (process.env.SERMONSIGHT_STT_PRIORITY || 'belownormal').toLowerCase()
    if (want === 'normal') return // inherit the app's own priority class
    const cls = want === 'high' ? 'High' : want === 'idle' ? 'Idle' : 'BelowNormal'
    try {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `try { (Get-Process -Id ${pid}).PriorityClass = '${cls}' } catch {}`
        ],
        { stdio: 'ignore', windowsHide: true }
      )
      ps.on('error', () => undefined)
      ps.unref?.()
    } catch {
      /* priority hint is best-effort */
    }
  }

  private handleMessage(raw: unknown): void {
    const msg = raw as { type?: string; text?: string; state?: SttState; message?: string }
    if (!msg || typeof msg !== 'object') return
    switch (msg.type) {
      case 'status':
        logger.info('stt worker status', { state: msg.state, message: msg.message ?? null, pid: process.pid })
        if (msg.state === 'listening') {
          this.workerReady = true
          // Engine healthy again — the crash recovery budget resets.
          this.restartAttempts = 0
          this.clearRestartTimer()
          if (this.pauseRequested) {
            // The worker's unconditional post-load 'listening' arrived after the
            // mic was turned off: drop stale buffered audio, re-assert pause, and
            // keep reporting the truth ('paused') until the mic comes back.
            this.pauseRequested = false
            this.loadQueue.length = 0
            this.loadFlush = false
            this.pendingAudio = false
            try {
              this.child?.send({ cmd: 'pause' })
            } catch {
              /* ignore */
            }
            break
          }
          this.setState('listening', null)
          this.replayLoadQueue()
          break
        }
        if (msg.state === 'starting' || msg.state === 'unavailable' || msg.state === 'error') {
          this.workerReady = false
        }
        this.setState(msg.state ?? 'error', msg.message ?? null)
        break
      case 'partial':
        this.emit({ type: 'partial', text: msg.text ?? '' })
        break
      case 'final':
        this.pendingAudio = false
        logger.info('stt final', { text: msg.text ?? '' })
        this.emit({ type: 'final', text: msg.text ?? '' })
        break
    }
  }

  /** True when the model directory exists (fast availability check). */
  static modelAvailable(): boolean {
    try {
      return fs.existsSync(defaultModelPath())
    } catch {
      return false
    }
  }
}

export const sttHost = new SttHost()
