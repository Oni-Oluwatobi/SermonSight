import React, { useEffect, useRef, useState } from 'react'
import type { AppState, DisplayInfo, Passage, TranslationInfo } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import { actions, setAudioStatus, showToast, useAudioStatus } from '../state/store'
import { audioInput } from '../audio/AudioInput'
import { CandidateSection } from '../components/CandidateSection'

const STATE_ICON: Record<string, string> = {
  idle: '○',
  silence: '◌',
  speech: '●',
  music: '♪',
  mixed: '◐',
  error: '!'
}

function MiniStage({ passage, black }: { passage: Passage | null; black: boolean }): JSX.Element {
  return (
    <div className={`stage mini-stage ${black ? 'black' : 'live-stage'}`}>
      {black ? (
        <div className="stage-empty">Output is blacked out</div>
      ) : passage && passage.verses.length > 0 ? (
        <>
          <div className="stage-ref">
            {passage.reference}
            <span className="trans">{passage.translation}</span>
          </div>
          <div className="stage-text">
            {passage.verses.slice(0, 3).map((v) => (
              <span key={v.canonicalId} style={{ display: 'block', marginBottom: 4 }}>
                <span className="vnum">{v.reference.split(' ').pop()}</span>
                {v.text.slice(0, 140)}
                {v.text.length > 140 ? '…' : ''}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="stage-empty">Nothing live</div>
      )}
    </div>
  )
}

function Waveform({ level, active }: { level: number; active: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const levelsRef = useRef<number[]>([])

  useEffect(() => {
    const arr = levelsRef.current
    arr.push(active ? level : 0)
    if (arr.length > 28) arr.shift()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const bars = arr.length
    const bw = w / 28
    for (let i = 0; i < bars; i++) {
      const v = Math.max(0.06, arr[i])
      const bh = Math.round(v * (h - 6))
      const x = w - (bars - i) * bw
      ctx.fillStyle = v > 0.55 ? '#10b981' : v > 0.2 ? '#ff8c00' : '#3e3e52'
      ctx.fillRect(x + 1, h - bh - 2, bw - 2, bh)
    }
  }, [level, active])

  return <canvas ref={canvasRef} width={220} height={36} className="waveform" aria-hidden="true" />
}

function DisplayMenu({
  displayId,
  onSelect
}: {
  displayId: number | null | undefined
  onSelect: (id: number | null) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    if (!open) return
    void actions
      .displays()
      .then(setDisplays)
      .catch(() => undefined)
  }, [open])

  const label =
    displays.find((d) => d.id === displayId)?.label ?? 'Follow default display'

  return (
    <div className="dropdown">
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        ▦ {label} ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          <button
            className={!displayId ? 'active' : ''}
            onClick={() => {
              onSelect(null)
              setOpen(false)
            }}
          >
            Follow default display
          </button>
          {displays.map((d) => (
            <button
              key={d.id}
              className={d.id === displayId ? 'active' : ''}
              onClick={() => {
                onSelect(d.id)
                setOpen(false)
              }}
            >
              {d.label}
              {d.primary ? ' (primary)' : ''} — {d.bounds.width}×{d.bounds.height}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ControlRoomScreen({
  state,
  onOpenSearch
}: {
  state: AppState | null
  onOpenSearch: () => void
}): JSX.Element {
  const audio = useAudioStatus()
  const [busy, setBusy] = useState(false)
  const [testText, setTestText] = useState('')
  const [showDiag, setShowDiag] = useState(false)
  const stt = state?.stt
  const pending = state?.candidates.candidates.length ?? 0
  const live = state?.live ?? null
  const preview = state?.preview ?? null
  const black = state?.black ?? false
  const p = state?.presentation
  const dbReady = state?.db.state === 'loaded'
  const translations: TranslationInfo[] = state?.db.translations ?? []

  const toggleListening = async (): Promise<void> => {
    setBusy(true)
    try {
      if (audioInput.isRunning()) {
        audioInput.stop()
      } else {
        await audioInput.start()
        if (stt?.state === 'unavailable') {
          showToast(
            `Microphone on — speech engine unavailable. ${stt.message ?? ''}`.trim(),
            'error',
            6000
          )
        } else {
          showToast('Listening. Say a reference like “John 3:16”.', 'success')
        }
      }
    } catch (err) {
      showToast(String(err instanceof Error ? err.message : err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const pauseListening = (): void => {
    if (audioInput.isRunning()) audioInput.stop()
  }

  const sendTest = async (): Promise<void> => {
    const t = testText.trim()
    if (!t) return
    try {
      const res = await window.api.invoke<{ ok: boolean; error?: string | null }>(
        IPC.TRANSCRIPT,
        t,
        false
      )
      if (!res.ok) showToast(res.error ?? 'Failed', 'error')
      else setTestText('')
    } catch (err) {
      showToast(String(err), 'error')
    }
  }

  const engineUnavailable = audio.listening && stt?.state === 'unavailable'
  const bannerTitle = engineUnavailable
    ? 'Microphone on — speech engine unavailable'
    : audio.label
  const bannerDetail = engineUnavailable
    ? (stt?.message ?? 'Speech engine unavailable — manual search and the test tool still work.')
    : (audio.error ??
      (audio.listening
        ? 'Audio is classified before it reaches the recognition engine — music is ignored.'
        : 'Microphone is off. Nothing is sent anywhere; recognition runs on this computer.'))

  return (
    <>
      <div className="cr-head">
        <div>
          <h1>Control Room</h1>
          <p>Live sermon engine — recognition, preview, and presentation, all offline.</p>
        </div>
        <div className="cr-head-actions">
          <select
            value={state?.translation ?? 'KJV'}
            onChange={(e) => void actions.setTranslation(e.target.value)}
            disabled={!dbReady}
            className="tselect"
            aria-label="Translation"
          >
            {translations.length === 0 && <option value={state?.translation}>—</option>}
            {translations.map((t) => (
              <option key={t.abbreviation} value={t.abbreviation}>
                {t.abbreviation}
                {t.available ? '' : ' (missing)'}
              </option>
            ))}
          </select>
          <div className="dropdown">
            <button
              className={`btn ${p?.windowOpen ? 'ghost' : 'primary'}`}
              onClick={() =>
                void (p?.windowOpen ? actions.closePresentation() : actions.openPresentation())
              }
              title="Open or close the audience output window"
            >
              {p?.windowOpen ? 'Output ▸ Open' : 'Open Output ▾'}
            </button>
            {p?.windowOpen && (
              <div className="dropdown-menu">
                <button onClick={() => void actions.toggleFullscreen()}>Toggle fullscreen</button>
                <button onClick={() => void actions.closePresentation()}>Close output</button>
              </div>
            )}
          </div>
          <DisplayMenu displayId={p?.displayId} onSelect={(id) => void actions.setDisplay(id)} />
        </div>
      </div>

      <div className="cr-grid">
        {/* Column 1 — Microphone */}
        <section className="panel mic-card">
          <div className="panel-title">
            Microphone
            <span className="pill" title={audio.error ?? undefined}>
              <span
                className={`dot ${audio.error ? 'err' : audio.listening ? 'ok' : ''}`}
              />
              {audio.error ? 'Error' : audio.listening ? 'Active' : 'Off'}
            </span>
          </div>

          <div className="mic-wave-row">
            <Waveform level={audio.level} active={audio.listening} />
            <span className="faint">Level {Math.round(audio.level * 100)}%</span>
          </div>

          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <button
              className={`btn ${audioInput.isRunning() ? 'primary' : 'primary'}`}
              style={{ flex: 1 }}
              disabled={busy || audio.error === 'Microphone unavailable. Check your audio input device.'}
              onClick={() => void toggleListening()}
            >
              {audioInput.isRunning() ? 'Pause microphone' : 'Start microphone'}
            </button>
            {audioInput.isRunning() && (
              <button
                className="btn reject"
                onClick={pauseListening}
                title="Stop the microphone — the engine stays ready to resume"
              >
                Stop microphone
              </button>
            )}
          </div>

          <div className={`state-banner ${engineUnavailable ? 'error' : audio.state}`}>
            <span className="big-icon">{STATE_ICON[engineUnavailable ? 'error' : audio.state] ?? '○'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="state-title">{bannerTitle}</div>
              <div className="faint">{bannerDetail}</div>
            </div>
          </div>

          <div className="panel-title" style={{ marginTop: 14 }}>
            Live Recognition
          </div>
          <div className="live-ring">
            <span className="live-ring-dot" />
            <div>
              <strong>
                {audio.listening ? 'Listening for scripture references…' : 'Microphone is off'}
              </strong>
              <div className="faint">
                {pending === 0
                  ? 'No pending candidates.'
                  : `${pending} candidate${pending === 1 ? '' : 's'} waiting for review.`}
              </div>
            </div>
          </div>

          <div className="panel-title" style={{ marginTop: 14 }}>
            Quick Controls
          </div>
          <div className="keycap-grid">
            <button className="keycap" onClick={() => void actions.black(!black)}>
              <kbd>B</kbd>
              <span>{black ? 'Unblack' : 'Black'}</span>
            </button>
            <button className="keycap" onClick={() => void actions.next()}>
              <kbd>Space</kbd>
              <span>Next</span>
            </button>
            <button
              className="keycap"
              disabled={!preview && !state?.live}
              onClick={() => {
                if (state?.live) void actions.next()
                else if (preview) void actions.present(preview.reference)
              }}
            >
              <kbd>Enter</kbd>
              <span>Present</span>
            </button>
            <button className="keycap" onClick={onOpenSearch}>
              <kbd>Ctrl K</kbd>
              <span>Search</span>
            </button>
          </div>

          <button className="link-btn diag-toggle" onClick={() => setShowDiag(!showDiag)}>
            {showDiag ? 'Hide diagnostics' : 'Diagnostics (injection test)'} ▾
          </button>
          {showDiag && (
            <div className="diag-box">
              <p className="faint" style={{ marginTop: 0 }}>
                Type the way a pastor speaks to rehearse the confirm workflow without audio:
                <em> “turn with me to John 3:16”, “Psalm 23”</em>.
              </p>
              <div className="test-box">
                <input
                  value={testText}
                  placeholder="John 3:16"
                  onChange={(e) => setTestText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendTest()
                  }}
                  spellCheck={false}
                />
                <button className="btn" disabled={!testText.trim()} onClick={() => void sendTest()}>
                  Feed to engine
                </button>
              </div>
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <button
                  className="btn ghost small"
                  onClick={() => setAudioStatus({ error: null, state: 'idle' })}
                >
                  Clear mic error
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => void actions.preview(state?.live?.reference ?? '')}
                  disabled={!state?.live}
                >
                  Re-preview live passage
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Column 2 — Recognition results */}
        <CandidateSection state={state} onOpenSearch={onOpenSearch} />

        {/* Column 3 — Live output */}
        <section className="panel live-card">
          <div className="panel-title">
            Output
            <span className={`pill ${live && !black ? 'live' : ''}`}>
              <span className={`dot ${black ? 'err' : live ? 'live' : ''}`} />
              {black ? 'Black' : live ? 'On air' : 'Empty'}
            </span>
          </div>

          <MiniStage passage={live} black={black} />

          <div className="live-meta">
            <div className="live-ref">{live ? live.reference : 'Nothing live'}</div>
            <div className="faint">
              {live ? `${live.translation} · ` : ''}
              Page {Math.min((p?.page ?? 0) + 1, p?.pageCount ?? 1)} of {p?.pageCount ?? 1}
            </div>
          </div>

          <button
            className="btn primary present-cta"
            disabled={!preview}
            onClick={() => void actions.present(preview?.reference ?? '')}
            title="Send preview to the live output (Enter)"
          >
            ▶ Present
            {preview ? ` ${preview.reference}` : ''}
          </button>
          {preview && (
            <div className="faint preview-hint">
              Preview ready: {preview.reference} — press Present to publish to the congregation.
            </div>
          )}

          <div className="transport">
            <button className="btn ghost" disabled={!live} onClick={() => void actions.prev()}>
              ◀ Prev
            </button>
            <span className="page-pill">
              {Math.min((p?.page ?? 0) + 1, p?.pageCount ?? 1)}/{p?.pageCount ?? 1}
            </span>
            <button className="btn ghost" disabled={!live} onClick={() => void actions.next()}>
              Next ▶
            </button>
            <button
              className={`btn ${black ? 'primary' : 'ghost'}`}
              onClick={() => void actions.black(!black)}
              title="Pause the audience screen (blank it) — B"
            >
              {black ? '▶ Resume' : '⏸ Pause'}
            </button>
          </div>

          <div className="output-status">
            <span className="status-item">
              <span className={`dot ${p?.windowOpen ? 'ok' : ''}`} />
              {p?.windowOpen ? 'Output open' : 'Output closed'}
            </span>
            {p?.windowOpen && (
              <button
                className="btn ghost small"
                onClick={() => void actions.toggleFullscreen()}
              >
                Fullscreen
              </button>
            )}
            <button className="btn ghost small" onClick={() => void actions.openPresentation()}>
              Open
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
