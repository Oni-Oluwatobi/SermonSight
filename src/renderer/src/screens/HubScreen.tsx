import React, { useEffect, useState } from 'react'
import { IPC, type SessionInfo } from '@shared/ipc'
import { actions, useAppState } from '../state/store'

function fmtWhen(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' }
  )}`
}

export function HubScreen({
  onNavigate,
  onOpenPairing,
  onOpenSettings
}: {
  onNavigate: (id: 'dashboard' | 'presentations') => void
  onOpenPairing: () => void
  onOpenSettings: () => void
}): JSX.Element {
  const state = useAppState()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const dbReady = state?.db.state === 'loaded'
  const pending = state?.candidates.candidates.length ?? 0
  const remoteRunning = state?.remote.state === 'running'

  const refresh = (): void => {
    void window.api
      .invoke<SessionInfo[]>(IPC.SESSIONS_LIST)
      .then(setSessions)
      .catch(() => undefined)
  }

  useEffect(refresh, [])

  const commitRename = (id: string): void => {
    void window.api
      .invoke<SessionInfo[]>(IPC.SESSIONS_RENAME, id, renameValue)
      .then(setSessions)
      .catch(() => undefined)
      .finally(() => setRenaming(null))
  }

  const last = sessions.find((s) => s.endedAt !== null)

  return (
    <>
      <div className="page-head">
        <h1>Welcome to SermonSight</h1>
        <p>
          {dbReady
            ? 'Ready for Sunday. Recognition, search, and presentation all run offline on this computer.'
            : 'The presentation engine will not show scripture until a valid sermonsight.ss database is loaded.'}
        </p>
      </div>

      <div className="hub-grid">
        <button className="hub-card" onClick={() => onNavigate('dashboard')}>
          <span className="hub-icon" aria-hidden="true">
            ◎
          </span>
          <strong>Control Room</strong>
          <span className="faint">
            {pending > 0 ? `${pending} candidate${pending === 1 ? '' : 's'} waiting` : 'Live recognition, preview & output'}
          </span>
        </button>
        <button className="hub-card" onClick={() => void actions.openPresentation()}>
          <span className="hub-icon" aria-hidden="true">
            ▶
          </span>
          <strong>Open Output</strong>
          <span className="faint">Audience projection window</span>
        </button>
        <button className="hub-card" onClick={onOpenPairing}>
          <span className="hub-icon" aria-hidden="true">
            ▦
          </span>
          <strong>Pair Remote</strong>
          <span className="faint">{remoteRunning ? `LAN on · ${state?.remote.clients ?? 0} phone(s)` : 'Phone controller over LAN'}</span>
        </button>
        <button className="hub-card" onClick={onOpenSettings}>
          <span className="hub-icon" aria-hidden="true">
            ⚙
          </span>
          <strong>Settings</strong>
          <span className="faint">Theme, database, engine</span>
        </button>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">
          Recent Sessions
          {sessions.length > 0 && (
            <button
              className="btn ghost small"
              onClick={() => {
                void window.api
                  .invoke<SessionInfo[]>(IPC.SESSIONS_CLEAR)
                  .then(setSessions)
                  .catch(() => undefined)
              }}
            >
              Clear history
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="faint">No sessions recorded yet.</div>
        ) : (
          <table className="trans-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Started</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td>
                    {renaming === s.id ? (
                      <input
                        className="rename-input"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(s.id)
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                        onBlur={() => commitRename(s.id)}
                      />
                    ) : (
                      <button
                        className="link-btn"
                        title="Rename session"
                        onClick={() => {
                          setRenaming(s.id)
                          setRenameValue(s.label)
                        }}
                      >
                        {s.label}
                      </button>
                    )}
                  </td>
                  <td className="faint">{fmtWhen(s.startedAt)}</td>
                  <td>
                    {s.endedAt === null ? (
                      <span className="pill">
                        <span className="dot live" />
                        In progress
                      </span>
                    ) : (
                      <span className="faint">Closed</span>
                    )}
                  </td>
                  <td>
                    {s.hadOutput && s.endedAt !== null && (
                      <button
                        className="btn small ghost"
                        onClick={() => {
                          void actions.openPresentation()
                          onNavigate('dashboard')
                        }}
                      >
                        Open last session
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {last && !last.hadOutput && (
          <p className="faint" style={{ marginBottom: 0 }}>
            “Open last session” appears for sessions that had the output window open.
          </p>
        )}
      </div>
    </>
  )
}
