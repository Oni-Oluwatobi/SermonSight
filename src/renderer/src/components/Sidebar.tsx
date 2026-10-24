import React from 'react'
import type { AppState } from '@shared/ipc'

export type ScreenId = 'hub' | 'dashboard' | 'presentations'

const ITEMS: { id: ScreenId; label: string; icon: string }[] = [
  { id: 'hub', label: 'Hub', icon: '⌂' },
  { id: 'dashboard', label: 'Control Room', icon: '◎' },
  { id: 'presentations', label: 'Presentations', icon: '▤' }
]

export function Sidebar({
  screen,
  onNavigate,
  onOpenSearch,
  onOpenSettings,
  state
}: {
  screen: ScreenId
  onNavigate: (id: ScreenId) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  state: AppState | null
}): JSX.Element {
  const pending = state?.candidates.candidates.length ?? 0
  const remoteRunning = state?.remote.state === 'running'

  return (
    <nav className="sidebar">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${screen === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
          {item.id === 'dashboard' && pending > 0 && <span className="badge">{pending} new</span>}
        </button>
      ))}

      <button className="nav-item" onClick={onOpenSearch} title="Scripture search (Ctrl+K)">
        <span className="nav-icon" aria-hidden="true">
          ⌕
        </span>
        <span>Search</span>
        <span className="badge kbd-badge">
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      <button className="nav-item" onClick={onOpenSettings}>
        <span className="nav-icon" aria-hidden="true">
          ⚙
        </span>
        <span>Settings</span>
        {remoteRunning && <span className="badge">LAN on</span>}
      </button>

      <div style={{ flex: 1 }} />
      <div className="sidebar-lockup">
        <span className="lockup-name">SermonSight</span>
        <span className="lockup-by">by The Kreadive Galaxy</span>
        <span className="lockup-tag">Empowering the World with Innovative AI</span>
      </div>
    </nav>
  )
}
