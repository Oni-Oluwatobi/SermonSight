import React, { useEffect, useState } from 'react'
import type { AppState, DisplayInfo, ThemeId } from '@shared/ipc'
import { THEMES } from '@core/presentation/themes'
import { actions } from '../state/store'

const THEME_ORDER: ThemeId[] = ['classic', 'minimal', 'dark']

const THEME_LABELS: Record<ThemeId, string> = {
  classic: 'Classic',
  minimal: 'Minimal',
  dark: 'Dark'
}

function ThemeCard({
  id,
  active,
  onSelect
}: {
  id: ThemeId
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const t = THEMES[id]
  return (
    <button className={`theme-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <span
        className="theme-preview"
        style={{ background: t.background, color: t.color, fontFamily: t.fontFamily }}
        aria-hidden="true"
      >
        <span style={{ color: t.referenceColor, fontSize: 9 }}>John 3:16</span>
        <span style={{ fontSize: 11 }}>For God so loved…</span>
      </span>
      <span className="theme-name">{THEME_LABELS[id]}</span>
    </button>
  )
}

export function PresentationsScreen({ state }: { state: AppState | null }): JSX.Element {
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
      <div className="page-head">
        <h1>Presentations</h1>
        <p>Output themes, sizing, display assignment, and the audience window.</p>
      </div>

      <div className="panel">
        <div className="panel-title">
          Output theme
          <span className={`pill ${p?.windowOpen ? 'live' : ''}`}>
            <span className={`dot ${p?.windowOpen ? 'ok' : ''}`} />
            {p?.windowOpen ? 'Output open' : 'Output closed'}
          </span>
        </div>
        <div className="theme-card-row">
          {THEME_ORDER.map((id) => (
            <ThemeCard
              key={id}
              id={id}
              active={(p?.theme ?? 'classic') === id}
              onSelect={() => void actions.setSettings({ theme: id })}
            />
          ))}
        </div>

        <div className="form-grid" style={{ marginTop: 18 }}>
          <label>Font size</label>
          <div className="control">
            <input
              type="range"
              min={60}
              max={160}
              step={5}
              value={p?.fontSizePct ?? 100}
              onChange={(e) => void actions.setSettings({ fontSizePct: Number(e.target.value) })}
              style={{ flex: 1, maxWidth: 320 }}
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

          <label>Display</label>
          <div className="control">
            <select
              className="tselect"
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
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <button
            className={`btn ${p?.windowOpen ? 'reject' : 'primary'}`}
            onClick={() =>
              void (p?.windowOpen ? actions.closePresentation() : actions.openPresentation())
            }
          >
            {p?.windowOpen ? 'Close output' : 'Open output'}
          </button>
          <button className="btn ghost" onClick={() => void actions.toggleFullscreen()}>
            Toggle fullscreen
          </button>
          <span className="faint">
            Page {Math.min((p?.page ?? 0) + 1, p?.pageCount ?? 1)} of {p?.pageCount ?? 1}
          </span>
        </div>
      </div>

      {!dbReadySafe(state) && (
        <div className="panel" style={{ borderColor: 'rgba(255,193,7,.5)', marginTop: 16 }}>
          <div className="panel-title">Sunday readiness</div>
          <p className="muted" style={{ margin: 0 }}>
            The presentation engine will not show any scripture until a valid{' '}
            <strong>sermonsight.ss</strong> database is loaded.
          </p>
        </div>
      )}
    </>
  )
}

function dbReadySafe(state: AppState | null): boolean {
  return state?.db.state === 'loaded'
}
