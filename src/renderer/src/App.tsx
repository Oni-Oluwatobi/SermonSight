import React, { useEffect, useState } from 'react'
import { IPC } from '@shared/ipc'
import { actions, useAppState, useAuth, useToast } from './state/store'
import { Sidebar, type ScreenId } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { DatabaseErrorOverlay } from './components/DatabaseErrorOverlay'
import { SearchModal } from './components/modals/SearchModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { PairingModal } from './components/modals/PairingModal'
import { ControlRoomScreen } from './screens/ControlRoomScreen'
import { HubScreen } from './screens/HubScreen'
import { PresentationsScreen } from './screens/PresentationsScreen'
import { PresentationScreen } from './screens/PresentationScreen'
import { LoginScreen } from './screens/LoginScreen'

const TITLE_SUB = 'by The Kreadive Galaxy · Empowering the World with Innovative AI'

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

export default function App(): JSX.Element {
  const isPresentation =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('window') === 'presentation'

  if (isPresentation) return <PresentationScreen />
  return <GatedApp />
}

function GatedApp(): JSX.Element {
  const auth = useAuth()
  if (auth.phase === 'loading') {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-loading">
          <span className="brand-name">SermonSight</span>
          <p className="auth-sub">Restoring session…</p>
        </div>
      </div>
    )
  }
  if (auth.phase === 'unauthenticated') return <LoginScreen />
  return <OperatorApp />
}

function OperatorApp(): JSX.Element {
  const state = useAppState()
  const toast = useToast()
  const [screen, setScreen] = useState<ScreenId>('hub')
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pairingOpen, setPairingOpen] = useState(false)
  const modalsOpen = searchOpen || settingsOpen || pairingOpen

  useEffect(() => {
    const off = window.api.on(IPC.PRESENTATION_STATE, () => undefined)
    return off
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen((open) => !open)
        return
      }
      if (modalsOpen) return
      const candidates = state?.candidates.candidates ?? []
      const activeIndex = state?.candidates.activeIndex ?? 0
      const active = candidates[activeIndex]
      if (e.key === 'Enter') {
        e.preventDefault()
        if (active) void actions.confirm(active.id)
        else if (state?.preview) void actions.present(state.preview.reference)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (active) void actions.reject(active.id)
        else if (state?.black) void actions.black(false)
      } else if (e.key === 'ArrowDown') {
        if (candidates.length === 0) return
        e.preventDefault()
        void actions.selectCandidate(Math.min(activeIndex + 1, candidates.length - 1))
      } else if (e.key === 'ArrowUp') {
        if (candidates.length === 0) return
        e.preventDefault()
        void actions.selectCandidate(Math.max(activeIndex - 1, 0))
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        if (state?.live) void actions.next()
        else if (state?.preview) void actions.present(state.preview.reference)
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        void actions.black(!state?.black)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, modalsOpen])

  const dbState = state?.db.state ?? 'not-checked'
  const showDbOverlay = dbState === 'missing' || dbState === 'invalid'

  return (
    <div className="app">
      <TitleBar subtitle={TITLE_SUB} />

      <Sidebar
        screen={screen}
        onNavigate={setScreen}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        state={state}
      />

      <main className="main">
        {screen === 'hub' && (
          <HubScreen
            onNavigate={setScreen}
            onOpenPairing={() => setPairingOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        {screen === 'dashboard' && (
          <ControlRoomScreen state={state} onOpenSearch={() => setSearchOpen(true)} />
        )}
        {screen === 'presentations' && <PresentationsScreen state={state} />}
      </main>

      <StatusBar state={state} />

      {searchOpen && <SearchModal state={state} onClose={() => setSearchOpen(false)} />}
      {settingsOpen && <SettingsModal state={state} onClose={() => setSettingsOpen(false)} />}
      {pairingOpen && <PairingModal state={state} onClose={() => setPairingOpen(false)} />}

      {showDbOverlay && state && (
        <DatabaseErrorOverlay
          db={state.db}
          onReload={() => void actions.reloadDb()}
          onChoose={() => void actions.chooseDb()}
        />
      )}

      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.tone}`}>{toast.message}</div>
        </div>
      )}
    </div>
  )
}
