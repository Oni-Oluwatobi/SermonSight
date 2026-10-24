import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { probeDatabase } from '../../core/database/DatabaseValidator'
import { ScriptureRepository } from '../../core/database/ScriptureRepository'
import { DatabaseError, type DbProbe, type SqlExecutor } from '../../core/database/schema'
import type { DbStatus } from '../../shared/ipc'
import { loadSettings } from '../settings'
import { logger } from '../logger'

const MISSING: DbStatus = {
  state: 'missing',
  path: null,
  error: 'SermonSight could not load the Scripture database.',
  schemaVersion: null,
  databaseVersion: null,
  canonical: null,
  translations: [],
  warnings: []
}

function defaultPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'sermonsight.ss')
  }
  return path.join(app.getAppPath(), 'assets', 'sermonsight.ss')
}

/** Locates, opens and validates sermonsight.ss. Never modifies the file. */
export class DatabaseService {
  private db: Database.Database | null = null
  private repo: ScriptureRepository | null = null
  private probe: DbProbe | null = null
  private status: DbStatus = { ...MISSING, state: 'not-checked' }
  private explicitPath: string | null = null

  resolvePath(): string | null {
    if (this.explicitPath) return this.explicitPath
    const configured = loadSettings().dbPath
    if (configured && configured.trim()) return configured
    return defaultPath()
  }

  choosePath(p: string | null): DbStatus {
    this.explicitPath = p
    return this.reload()
  }

  getStatus(): DbStatus {
    return this.status
  }

  getRepository(): ScriptureRepository | null {
    return this.repo
  }

  getProbe(): DbProbe | null {
    return this.probe
  }

  close(): void {
    try {
      this.db?.close()
    } catch {
      /* ignore */
    }
    this.db = null
    this.repo = null
    this.probe = null
  }

  reload(): DbStatus {
    this.close()
    const target = this.resolvePath()
    if (!target) {
      this.status = { ...MISSING, state: 'missing', error: defaultMissingMessage(null) }
      return this.status
    }
    if (!fs.existsSync(target)) {
      this.status = { ...MISSING, state: 'missing', path: target, error: defaultMissingMessage(target) }
      logger.warn('scripture database not found', { path: target })
      return this.status
    }
    try {
      const db = new Database(target, { readonly: true, fileMustExist: true })
      db.pragma('query_only = ON')
      this.db = db
      const executor: SqlExecutor = {
        get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
          return db.prepare(sql).get(...((params ?? []) as any[])) as T | undefined
        },
        all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
          return db.prepare(sql).all(...((params ?? []) as any[])) as T[]
        }
      }
      const probe = probeDatabase(executor)
      this.probe = probe
      if (probe.problems.length > 0) {
        throw new DatabaseError(probe.problems.join('; '), 'schema-mismatch')
      }
      const repo = new ScriptureRepository(executor, probe)
      const bookWarnings = repo.getWarnings()
      if (bookWarnings.filter((w) => w.startsWith('book missing')).length >= 66) {
        throw new DatabaseError('no recognizable books in database', 'schema-mismatch')
      }
      this.repo = repo
      this.status = {
        state: 'loaded',
        path: target,
        error: null,
        schemaVersion: probe.schemaVersion,
        databaseVersion: probe.databaseVersion,
        canonical: probe.canonical,
        translations: repo.listTranslations(),
        warnings: [...probe.warnings, ...bookWarnings]
      }
      logger.info('scripture database loaded', {
        path: target,
        schema: probe.schemaVersion,
        translations: this.status.translations.filter((t) => t.available).map((t) => t.abbreviation)
      })
    } catch (err) {
      const e = err as Error & { code?: string }
      let code: DbStatus['state'] = 'invalid'
      let message = e.message || String(err)
      if (/SQLITE_NOTADB|not a database/i.test(message)) {
        code = 'invalid'
        message = 'The selected file is not a valid Scripture database.'
      } else if (e instanceof DatabaseError) {
        message = e.message
      }
      this.status = {
        state: code,
        path: target,
        error: message,
        schemaVersion: null,
        databaseVersion: null,
        canonical: null,
        translations: [],
        warnings: []
      }
      logger.error('scripture database failed to load', { path: target, error: message })
    }
    return this.status
  }
}

function defaultMissingMessage(target: string | null): string {
  return target
    ? `Scripture database not found at:\n${target}\n\nPlace sermonsight.ss there or choose the database file.`
    : 'SermonSight could not load the Scripture database.'
}

export const databaseService = new DatabaseService()
