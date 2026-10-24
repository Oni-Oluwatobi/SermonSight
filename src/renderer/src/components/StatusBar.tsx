import React from 'react'
import type { AppState } from '@shared/ipc'
import { useAudioStatus, actions } from '../state/store'

export function StatusBar({ state }: { state: AppState | null }): JSX.Element {
  const audio = useAudioStatus()
  const db = state?.db
  const stt = state?.stt
  const remote = state?.remote
  const live = state?.live

  const dbDot =
    db?.state === 'loaded' ? 'ok' : db?.state === 'not-checked' ? '' : 'err'
  const sttDot =
    stt?.state === 'listening' ? 'ok' : stt?.state === 'error' ? 'err' : 'info'

  return (
    <footer className="statusbar">
      <span className="status-item">
        <span className={`dot ${dbDot}`} />
        {db?.state === 'loaded'
          ? `${db.path?.split(/[\\/]/).pop() ?? 'database'}`
          : db?.state === 'missing'
            ? 'Scripture database missing'
            : db?.state === 'invalid'
              ? 'Scripture database invalid'
              : 'Checking database…'}
      </span>

      <span className="status-item">
        <span className={`dot ${sttDot}`} />
        Speech: {stt?.state ?? 'unavailable'}
      </span>

      <span className="status-item" title={audio.error ?? undefined}>
        <span className={`dot ${audio.error ? 'err' : audio.listening ? 'ok' : ''}`} />
        {audio.error ? 'Mic error' : audio.label}
      </span>

      <span className="status-item">
        <span className={`dot ${remote?.state === 'running' ? 'ok' : ''}`} />
        {remote?.state === 'running'
          ? `Remote ${remote.clients} connected`
          : 'Remote off'}
      </span>

      <span className="spacer" />

      <span className="transcript-chip">
        {state?.candidates.lastTranscript
          ? `“${state.candidates.lastTranscript}”`
          : state?.candidates.searching
            ? 'Searching…'
            : ''}
      </span>

      <span className="status-item">
        <span className={`dot ${state?.black ? 'err' : live ? 'live' : ''}`} />
        {state?.black ? 'Screen black' : live ? `Live · ${live.reference}` : 'Live · empty'}
      </span>

      <button
        className="btn ghost small"
        style={{ marginLeft: 4 }}
        onClick={() => void actions.black(!state?.black)}
        title="Toggle black screen (B)"
      >
        {state?.black ? 'Unblack' : 'Black'}
      </button>
    </footer>
  )
}
