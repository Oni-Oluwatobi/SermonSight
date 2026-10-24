import Database from 'better-sqlite3'
import { probeDatabase } from '../../core/database/DatabaseValidator'
import { ScriptureRepository } from '../../core/database/ScriptureRepository'
import type { SqlExecutor } from '../../core/database/schema'
import type { SearchResponse } from '../../shared/ipc'

interface SearchJob {
  query: string
  translation: string
  limit?: number
}

type OutMessage =
  | { ready: true }
  | { fatal: string }
  | { result: SearchResponse }
  | { error: string }

function send(msg: OutMessage): void {
  if (typeof process.send === 'function') process.send(msg)
}

// Forked from the main process with the database path as argv[2].
// Runs every keyword/phrase scan OUTSIDE the main process so a low-end CPU can
// never freeze the UI while a search is scanning the verses table.
const dbPath = process.argv[2]
let repo: ScriptureRepository | null = null

try {
  if (!dbPath) throw new Error('missing database path argument')
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('query_only = ON')
  const executor: SqlExecutor = {
    get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
      return db.prepare(sql).get(...((params ?? []) as unknown[])) as T | undefined
    },
    all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
      return db.prepare(sql).all(...((params ?? []) as unknown[])) as T[]
    }
  }
  const probe = probeDatabase(executor)
  if (probe.problems.length > 0) throw new Error(probe.problems.join('; '))
  repo = new ScriptureRepository(executor, probe)
  send({ ready: true })
} catch (err) {
  send({ fatal: String((err as Error)?.message ?? err) })
}

process.on('message', (job: SearchJob) => {
  if (!job || typeof job.query !== 'string') return
  if (!repo) {
    send({ error: 'Scripture database is not loaded.' })
    return
  }
  try {
    send({ result: repo.search(job.query, job.translation, job.limit ?? 50) })
  } catch (err) {
    send({ error: `Search failed: ${String(err)}` })
  }
})
