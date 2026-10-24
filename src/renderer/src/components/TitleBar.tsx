import React, { useEffect, useState } from 'react'
import { IPC } from '@shared/ipc'
import { WaveformLogo } from './icons/DesignIcons'

export function TitleBar({ subtitle }: { subtitle: string }): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api
      .invoke<boolean>(IPC.WINDOW_IS_MAXIMIZED)
      .then((m) => setMaximized(m === true))
      .catch(() => undefined)
    const off = window.api.on(IPC.WINDOW_MAXIMIZED, (m) => setMaximized(m === true))
    return off
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-left drag">
        <WaveformLogo className="brand-glyph" />
        <div className="titlebar-brand">
          <span className="titlebar-name">SermonSight</span>
          <span className="titlebar-sub">{subtitle}</span>
        </div>
      </div>
      <div className="titlebar-center drag">
        <span
          className="pill offline-pill"
          title="Recognition and presentation run fully offline on this computer"
        >
          <span className="dot live" />
          Offline Mode
        </span>
      </div>
      <div className="titlebar-right">
        <button
          className="tb-btn"
          title="Minimize"
          onClick={() => void window.api.invoke(IPC.WINDOW_MINIMIZE)}
        >
          ─
        </button>
        <button
          className="tb-btn"
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => {
            void window.api
              .invoke<boolean>(IPC.WINDOW_MAXIMIZE)
              .then((m) => setMaximized(m === true))
              .catch(() => undefined)
          }}
        >
          {maximized ? '❐' : '▢'}
        </button>
        <button
          className="tb-btn close"
          title="Close"
          onClick={() => void window.api.invoke(IPC.WINDOW_CLOSE)}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
