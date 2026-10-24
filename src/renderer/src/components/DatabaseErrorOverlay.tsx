import React from 'react'
import type { DbStatus } from '@shared/ipc'

/**
 * Full-screen error described by the spec: shown when sermonsight.ss is
 * missing or fails validation. Never shows fabricated scripture.
 */
export function DatabaseErrorOverlay({
  db,
  onReload,
  onChoose
}: {
  db: DbStatus
  onReload: () => void
  onChoose: () => void
}): JSX.Element {
  const missing = db.state === 'missing'
  return (
    <div className="overlay" role="alertdialog" aria-modal="true">
      <div className="dialog">
        <h2>{missing ? 'Scripture database not found' : 'Scripture database error'}</h2>
        <p>
          {missing
            ? 'SermonSight could not find its Scripture database file.'
            : 'SermonSight found a file but could not read a valid Scripture database from it.'}
        </p>
        <p className="faint" style={{ marginTop: 12 }}>
          Location: {db.path ?? 'assets/sermonsight.ss'}
        </p>
        {db.error && <p className="faint">{db.error}</p>}
        <p style={{ marginTop: 14 }}>
          Place <strong>sermonsight.ss</strong> in the app’s assets folder, or choose another
          file. Search and presentation will remain unavailable until a valid database is loaded —
          SermonSight will never invent Scripture text.
        </p>
        <div className="actions">
          <button className="btn ghost" onClick={onChoose}>
            Choose file…
          </button>
          <button className="btn primary" onClick={onReload}>
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
