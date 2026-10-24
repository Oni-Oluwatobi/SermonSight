import React, { useEffect, useState } from 'react'
import type { AppState, DisplayInfo, SettingsShape, ThemeId, TranslationInfo } from '@shared/ipc'
import { actions, applyAppTheme, showToast, useAuth } from '../../state/store'
import { authSignOut } from '../../auth/firebaseAuth'
import { ModalShell } from './ModalShell'

type Tab = 'general' | 'presentation' | 'remote' | 'database' | 'account'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'remote', label: 'Remote Control' },
  { id: 'database', label: 'Database' },
  { id: 'account', label: 'Account' }
]

function GeneralSection({ state }: { state: AppState | null }): JSX.Element {
  const [settings, setLocal] = useState<SettingsShape | null>(null)

  useEffect(() => {
    void actions
      .getSettings()
      .then(setLocal)
      .catch(() => undefined)
  }, [])

  return (
    <div className="panel">
      <div className="panel-title">Appearance</div>
      <div className="form-grid">
        <label>App theme</label>
        <div className="control theme-radio-row">
          {(['dark', 'light'] as const).map((t) => (
            <label key={t} className="radio-card">
              <input
                type="radio"
                name="appTheme"
                checked={(settings?.appTheme ?? 'dark') === t}
                onChange={() => {
                  if (!settings) return
                  setLocal({ ...settings, appTheme: t })
                  void actions.setSettings({ appTheme: t }).then(() => applyAppTheme(t))
                }}
              />
              <span className={`theme-swatch ${t}`} aria-hidden="true" />
              <span>{t === 'dark' ? 'Dark' : 'Light'}</span>
            </label>
          ))}
        </div>

        <label>Open last session</label>
        <div className="control">
          <input
            type="checkbox"
            checked={settings?.openLastSession ?? false}
            onChange={(e) => {
              if (!settings) return
              setLocal({ ...settings, openLastSession: e.target.checked })
              void actions.setSettings({ openLastSession: e.target.checked })
            }}
          />
          <span className="faint">Reopen the output window on launch if it was open at exit.</span>
        </div>

        <label>Log level</label>
        <div className="control">
          <select
            value={settings?.logLevel ?? 'info'}
            onChange={(e) => {
              const v = e.target.value as SettingsShape['logLevel']
              if (settings) setLocal({ ...settings, logLevel: v })
              void actions.setSettings({ logLevel: v })
            }}
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <span className="faint">Logs are written locally for Sunday diagnostics.</span>
        </div>
      </div>
      {state && (
        <p className="faint" style={{ marginBottom: 0 }}>
          Everything here works without internet. Changes apply immediately.
        </p>
      )}
    </div>
  )
}

function PresentationSection({ state }: { state: AppState | null }): JSX.Element {
  const p = state?.presentation
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    void actions
      .displays()
      .then(setDisplays)
      .catch(() => undefined)
  }, [p?.windowOpen])

  return (
    <>
      <div className="panel">
        <div className="panel-title">Presentation output</div>
        <div className="form-grid">
          <label>Theme</label>
          <div className="control">
            <select
              value={p?.theme ?? 'classic'}
              onChange={(e) => void actions.setSettings({ theme: e.target.value as ThemeId })}
            >
              <option value="classic">Classic (parchment on black)</option>
              <option value="minimal">Minimal (white on black)</option>
              <option value="dark">Dark (soft grey)</option>
            </select>
          </div>

          <label>Font size</label>
          <div className="control">
            <input
              type="range"
              min={60}
              max={160}
              step={5}
              value={p?.fontSizePct ?? 100}
              onChange={(e) =>
                void actions.setSettings({ fontSizePct: Number(e.target.value) })
              }
              style={{ flex: 1, maxWidth: 260 }}
            />
            <span className="faint">{p?.fontSizePct ?? 100}%</span>
          </div>

          <label>Show reference</label>
          <div className="control">
            <input
              type="checkbox"
              checked={p?.showReference ?? true}
              onChange={(e) => void actions.setSettings({ showReference: e.target.checked })}
            />
          </div>

          <label>Show translation badge</label>
          <div className="control">
            <input
              type="checkbox"
              checked={p?.showTranslationBadge ?? true}
              onChange={(e) => void actions.setSettings({ showTranslationBadge: e.target.checked })}
            />
          </div>

          <label>Output display</label>
          <div className="control">
            <select
              value={p?.displayId === null || p?.displayId === undefined ? '' : String(p.displayId)}
              onChange={(e) =>
                void actions.setDisplay(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">Follow default display</option>
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.primary ? ' (primary)' : ''} — {d.bounds.width}×{d.bounds.height}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => void actions.openPresentation()}>
              Open
            </button>
            <button className="btn small" onClick={() => void actions.toggleFullscreen()}>
              Fullscreen
            </button>
          </div>
        </div>
      </div>
      <EasyWorshipSection />
    </>
  )
}

function EasyWorshipSection(): JSX.Element {
  const [status, setStatus] = useState<{
    detected: boolean
    version: string | null
    installPaths: string[]
    methods: string[]
    note: string
  } | null>(null)

  useEffect(() => {
    void actions
      .easyWorshipStatus()
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  return (
    <div className="panel">
      <div className="panel-title">
        EasyWorship (optional)
        <span className="pill">
          <span className={`dot ${status?.detected ? 'ok' : ''}`} />
          {status
            ? status.detected
              ? `Detected${status.version ? ` v${status.version}` : ''}`
              : 'Not installed'
            : 'Checking…'}
        </span>
      </div>
      <p className="faint" style={{ marginTop: 0 }}>
        {status?.note ?? 'Checking for a local EasyWorship installation…'}
      </p>
      <div className="row">
        <button
          className="btn ghost"
          onClick={() => {
            void actions
              .easyWorshipCopy()
              .then((r) =>
                showToast(
                  r.ok ? 'Scripture copied — paste it into EasyWorship.' : (r.error ?? 'Copy failed.'),
                  r.ok ? 'success' : 'error'
                )
              )
              .catch(() => undefined)
          }}
        >
          Copy current scripture
        </button>
        <span className="faint">
          Paste into EasyWorship&#39;s Bible input. SermonSight never modifies EasyWorship.
        </span>
      </div>
    </div>
  )
}

function DatabaseSection({ state }: { state: AppState | null }): JSX.Element {
  const db = state?.db
  const translations: TranslationInfo[] = db?.translations ?? []
  const ready = db?.state === 'loaded'

  return (
    <div className="panel">
      <div className="panel-title">
        Scripture database
        <span className={`pill`}>
          <span className={`dot ${ready ? 'ok' : db?.state === 'not-checked' ? '' : 'err'}`} />
          {ready
            ? 'Loaded'
            : db?.state === 'missing'
              ? 'Missing'
              : db?.state === 'invalid'
                ? 'Invalid'
                : 'Checking'}
        </span>
      </div>

      <div className="form-grid">
        <label>Database file</label>
        <div className="control">
          <span className="path-display">{db?.path ?? 'assets/sermonsight.ss (not found)'}</span>
        </div>

        <label>Actions</label>
        <div className="control">
          <button className="btn small" onClick={() => void actions.reloadDb()}>
            Reload
          </button>
          <button className="btn small" onClick={() => void actions.chooseDb()}>
            Choose file…
          </button>
          <span className="faint">Supported: .ss / .sqlite / .db</span>
        </div>

        <label>Schema / version</label>
        <div className="control faint">
          {db?.schemaVersion ?? '—'} · {db?.databaseVersion ?? '—'} · {db?.canonical ?? '—'}
        </div>
      </div>

      {db && db.warnings.length > 0 && (
        <div className="faint" style={{ marginTop: 10 }}>
          {db.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="panel-title" style={{ marginTop: 18 }}>
        Translations
      </div>
      <table className="trans-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Language</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {translations.length === 0 && (
            <tr>
              <td colSpan={4} className="missing">
                No database loaded.
              </td>
            </tr>
          )}
          {translations.map((t) => (
            <tr key={t.abbreviation}>
              <td>
                <strong>{t.abbreviation}</strong>
              </td>
              <td>{t.name}</td>
              <td className="faint">{t.language ?? '—'}</td>
              <td className={t.available ? 'avail' : 'missing'}>
                {t.available ? 'Available' : 'Not in database'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint" style={{ marginBottom: 0 }}>
        Availability depends on the installed database. Missing translations never block search or
        presentation.
      </p>
    </div>
  )
}

export function AccountSection(): JSX.Element {
  const auth = useAuth()

  return (
    <div className="panel">
      <div className="panel-title">Account</div>
      <div className="form-grid">
        <label>Cloud account</label>
        <div className="control">
          <span className="faint">
            {auth.phase === 'authenticated'
              ? `Signed in${auth.email ? ` — ${auth.email}` : ''}`
              : 'Signed out — sign in from the launch screen'}
          </span>
        </div>
        <label>Session</label>
        <div className="control">
          <button className="btn small reject" onClick={() => void authSignOut()}>
            Sign out
          </button>
          <span className="faint">Ends the local session on this device.</span>
        </div>
      </div>
    </div>
  )
}

function EngineSection({ state }: { state: AppState | null }): JSX.Element {
  const stt = state?.stt

  return (
    <div className="panel">
      <div className="panel-title">Engine</div>
      <div className="form-grid">
        <label>Speech recognition</label>
        <div className="control">
          <span className="faint">
            {stt?.state === 'listening'
              ? `Offline model active (${stt.engine})`
              : stt?.state === 'unavailable'
                ? 'Vosk model not found — place vosk-model-small-en-us-0.15 in models/'
                : (stt?.message ?? stt?.state ?? '—')}
          </span>
        </div>
      </div>
    </div>
  )
}

export function SettingsModal({
  state,
  onClose
}: {
  state: AppState | null
  onClose: () => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <ModalShell title="Settings" onClose={onClose} wide>
      <div className="settings-layout">
        <nav className="settings-rail" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`rail-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === 'general' && <GeneralSection state={state} />}
          {tab === 'presentation' && <PresentationSection state={state} />}
          {tab === 'remote' && <RemoteSection state={state} />}
          {tab === 'database' && <DatabaseSection state={state} />}
          {tab === 'account' && (
            <>
              <AccountSection />
              <EngineSection state={state} />
            </>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

export function RemoteSection({ state }: { state: AppState | null }): JSX.Element {
  const remote = state?.remote
  const [qr, setQr] = useState<string | null>(null)
  const running = remote?.state === 'running'

  const refresh = async (): Promise<void> => {
    try {
      const res = await actions.remoteStatus()
      setQr(res.qr ?? null)
    } catch {
      /* toast already shown */
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote?.state])

  return (
    <div className="panel">
      <div className="panel-title">
        Phone remote (optional)
        <span className="pill">
          <span className={`dot ${running ? 'ok' : ''}`} />
          {running ? 'Running' : 'Disabled'}
        </span>
      </div>
      <p className="faint" style={{ marginTop: 0 }}>
        The phone is a remote control only — it never becomes a second presentation surface. The
        server binds to your private LAN address and never requires internet.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button
          className={`btn ${running ? 'reject' : 'primary'}`}
          onClick={() => {
            void actions
              .setRemoteEnabled(!running)
              .then(() => refresh())
              .catch(() => undefined)
          }}
        >
          {running ? 'Stop remote' : 'Start remote'}
        </button>
        {running && (
          <button
            className="btn ghost"
            onClick={() => {
              void actions
                .newPin()
                .then((r) => {
                  setQr(r.qr ?? null)
                  showToast(`New PIN: ${r.pin}`, 'success')
                })
                .catch(() => undefined)
            }}
          >
            New pairing code
          </button>
        )}
      </div>

      {running && (
        <div className="qr-wrap">
          {qr && <img src={qr} alt="Pairing QR code" />}
          <dl className="kv">
            <dt>URL</dt>
            <dd className="path-display">{remote?.url ?? '—'}</dd>
            <dt>LAN address</dt>
            <dd className="path-display">
              {remote?.lanIp ?? '—'}:{remote?.port ?? '—'}
            </dd>
            <dt>Pairing code</dt>
            <dd>
              {remote?.pin ? (
                <span className="pin-code">{remote.pin}</span>
              ) : (
                'Generate a code to pair a phone'
              )}
            </dd>
            <dt>Connected phones</dt>
            <dd>{remote?.clients ?? 0}</dd>
            <dt>Code expires</dt>
            <dd className="faint">
              {remote?.pinExpiresAt ? new Date(remote.pinExpiresAt).toLocaleTimeString() : '—'}
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}
