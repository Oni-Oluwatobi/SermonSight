import { fork, spawn, type ChildProcess } from 'child_process'
import path from 'path'
import type { SearchResponse } from '../../shared/ipc'
import { databaseService } from './DatabaseService'
import { logger } from '../logger'

interface QueuedSearch {
  query: string
  translation: string
  limit?: number
  canSkip: boolean
  resolve: (res: SearchResponse) => void
}

export interface SearchOptions {
  /**
   * true for operator-initiated searches: when a newer skippable search is
   * queued behind it, the older one is superseded instead of executed.
   * Recognition searches use false — every utterance must run.
   */
  canSkip?: boolean
}

const READY_TIMEOUT_MS = 15_000
const JOB_TIMEOUT_MS = 15_000
const MAX_RESTART_ATTEMPTS = 3

function workerPath(): string {
  return path.join(__dirname, 'searchWorker.js')
}

function responseFor(
  query: string,
  translation: string,
  error: string | null,
  superseded = false
): SearchResponse {
  return {
    kind: 'unknown',
    query,
    translation,
    results: [],
    truncated: false,
    error,
    ...(superseded ? { superseded: true } : {})
  }
}

/**
 * Main-process proxy for the search worker child.
 *
 * Rationale: keyword searches are full scans of the verses table
 * (measured 40-150ms on the dev machine, considerably more on a cold cache on a
 * low-end laptop). Running them in the main process blocked window management and
 * IPC for that duration. The child runs one job at a time; the parent queues,
 * supersede-skips obsolete operator searches, watchdogs timeouts, and falls back
 * to the in-process repository if the child cannot run at all.
 */
export class SearchService {
  private child: ChildProcess | null = null
  private childReady = false
  private disabledPath: string | null = null
  private activePath: string | null = null
  private restartAttempts = 0
  private queue: QueuedSearch[] = []
  private inFlight: QueuedSearch | null = null
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private jobTimer: ReturnType<typeof setTimeout> | null = null

  /** Pre-spawn the child at startup so the first search pays no spawn cost. */
  warm(): void {
    this.ensureChild()
  }

  search(
    query: string,
    translation: string,
    limit?: number,
    options?: SearchOptions
  ): Promise<SearchResponse> {
    const q = query.trim()
    if (!q) return Promise.resolve(responseFor(query, translation, null))
    if (!databaseService.getRepository()) {
      return Promise.resolve(responseFor(q, translation, 'Scripture database is not loaded.'))
    }
    return new Promise<SearchResponse>((resolve) => {
      const job: QueuedSearch = {
        query: q,
        translation,
        limit,
        canSkip: options?.canSkip ?? false,
        resolve
      }
      if (job.canSkip) {
        const idx = this.queue.findIndex((j) => j.canSkip)
        if (idx >= 0) {
          const stale = this.queue.splice(idx, 1)[0]
          stale.resolve(responseFor(stale.query, stale.translation, null, true))
        }
      }
      this.queue.push(job)
      this.pump()
    })
  }

  dispose(): void {
    const err = 'SermonSight is shutting down.'
    for (const job of this.queue.splice(0)) job.resolve(responseFor(job.query, job.translation, err))
    if (this.inFlight) {
      const job = this.inFlight
      this.inFlight = null
      job.resolve(responseFor(job.query, job.translation, err))
    }
    this.dropChild()
  }

  private pump(): void {
    if (this.inFlight || this.queue.length === 0) return

    if (!this.ensureChild()) {
      // No worker available: run the remaining jobs in-process (bounded work).
      while (this.queue.length > 0) {
        const job = this.queue.shift()
        if (job) job.resolve(this.runInProcess(job))
      }
      return
    }
    if (!this.childReady || !this.child) return // pump again when the child reports ready

    const job = this.queue.shift()
    if (!job) return
    this.inFlight = job
    try {
      this.child.send({ query: job.query, translation: job.translation, limit: job.limit })
    } catch (err) {
      this.finishInFlight(responseFor(job.query, job.translation, `Search failed: ${String(err)}`))
      return
    }
    this.jobTimer = setTimeout(() => {
      logger.error('search worker job timed out; restarting worker')
      this.dropChild()
      this.restartAttempts += 1
      this.finishInFlight(responseFor(job.query, job.translation, 'Search timed out.'))
    }, JOB_TIMEOUT_MS)
    this.jobTimer.unref?.()
  }

  private finishInFlight(res: SearchResponse): void {
    const job = this.inFlight
    this.inFlight = null
    this.clearJobTimer()
    if (job) job.resolve(res)
    this.pump()
  }

  private ensureChild(): boolean {
    const target = databaseService.resolvePath()
    if (!target || target === this.disabledPath) return false
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.disabledPath = target
      logger.error(
        `search worker failed ${this.restartAttempts} times; using in-process search fallback`
      )
      return false
    }
    if (this.child && this.activePath !== target) this.dropChild()
    if (this.child) return true

    this.activePath = target
    try {
      const child = fork(workerPath(), [target], {
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        env: { ...process.env }
      })
      this.child = child
      this.childReady = false
      child.on('message', (raw: unknown) => this.onChildMessage(child, raw))
      child.on('error', (err) => {
        logger.error('search worker error', String(err))
        if (this.child !== child) return
        this.child = null
        this.childReady = false
        this.clearReadyTimer()
        this.restartAttempts += 1
        const job = this.inFlight
        this.inFlight = null
        this.clearJobTimer()
        if (job) job.resolve(responseFor(job.query, job.translation, `Search worker failed: ${String(err)}`))
        this.pump()
      })
      child.on('exit', (code, signal) => {
        logger.warn('search worker exited', { code, signal })
        if (this.child !== child) return
        this.child = null
        this.childReady = false
        this.clearReadyTimer()
        this.restartAttempts += 1
        const job = this.inFlight
        this.inFlight = null
        this.clearJobTimer()
        if (job) job.resolve(responseFor(job.query, job.translation, 'Search worker stopped.'))
        this.pump() // respawn (if under the restart cap) or drain via fallback
      })
      this.readyTimer = setTimeout(() => {
        logger.error('search worker did not become ready in time')
        this.dropChild()
        this.restartAttempts += 1
        this.pump()
      }, READY_TIMEOUT_MS)
      this.readyTimer.unref?.()
      return true
    } catch (err) {
      logger.error('could not start search worker', String(err))
      this.disabledPath = target
      this.child = null
      this.childReady = false
      return false
    }
  }

  private onChildMessage(child: ChildProcess, raw: unknown): void {
    if (this.child !== child) return
    const msg = raw as
      | { ready?: boolean; fatal?: string; result?: SearchResponse; error?: string }
      | undefined
    if (!msg) return
    if (msg.ready) {
      this.childReady = true
      this.restartAttempts = 0
      this.clearReadyTimer()
      this.pump()
      return
    }
    if (msg.fatal) {
      logger.error('search worker could not open database', msg.fatal)
      this.disabledPath = this.activePath
      this.dropChild()
      this.pump() // drains the queue through the in-process fallback
      return
    }
    if (this.inFlight) {
      if (msg.result) {
        this.finishInFlight(msg.result)
      } else if (msg.error) {
        this.finishInFlight(responseFor(this.inFlight.query, this.inFlight.translation, msg.error))
      }
      return
    }
    logger.warn('search worker sent an unexpected message', msg as unknown as Record<string, unknown>)
  }

  private dropChild(): void {
    const child = this.child
    this.child = null
    this.childReady = false
    this.clearReadyTimer()
    this.clearJobTimer()
    if (child) {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }
  }

  private runInProcess(job: QueuedSearch): SearchResponse {
    try {
      const repo = databaseService.getRepository()
      if (!repo) return responseFor(job.query, job.translation, 'Scripture database is not loaded.')
      return repo.search(job.query, job.translation, job.limit ?? 50)
    } catch (err) {
      logger.error('in-process search failed', String(err))
      return responseFor(job.query, job.translation, `Search failed: ${String(err)}`)
    }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
  }

  private clearJobTimer(): void {
    if (this.jobTimer) {
      clearTimeout(this.jobTimer)
      this.jobTimer = null
    }
  }
}

export const searchService = new SearchService()
