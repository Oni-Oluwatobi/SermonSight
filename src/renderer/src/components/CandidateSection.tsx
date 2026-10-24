import React, { useCallback, useRef, useState } from 'react'
import type { AppState, SearchResponse } from '@shared/ipc'
import { actions, showToast } from '../state/store'

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function CandidateSection({
  state,
  onOpenSearch
}: {
  state: AppState | null
  onOpenSearch: () => void
}): JSX.Element {
  const [tab, setTab] = useState<'recognition' | 'search'>('recognition')
  const cs = state?.candidates
  const candidates = cs?.candidates ?? []
  const activeIndex = cs?.activeIndex ?? 0
  const active = candidates[activeIndex]

  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const seqRef = useRef(0)
  const dbReady = state?.db.state === 'loaded'

  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      const seq = ++seqRef.current
      if (!trimmed) {
        setResponse(null)
        setBusy(false)
        return
      }
      if (!dbReady) {
        showToast('Scripture database is not loaded yet.', 'error')
        return
      }
      setBusy(true)
      try {
        const res = await actions.search(trimmed, state?.translation ?? 'KJV')
        if (seq !== seqRef.current) return
        setResponse(res)
        if (res.error) showToast(res.error, 'error')
      } catch {
        /* toast already shown by the store */
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    },
    [dbReady, state?.translation]
  )

  return (
    <section className="cand-section">
      <div className="cand-tabs" role="tablist" aria-label="Recognition results">
        <button
          role="tab"
          aria-selected={tab === 'recognition'}
          className={`cand-tab ${tab === 'recognition' ? 'active' : ''}`}
          onClick={() => setTab('recognition')}
        >
          Recognition Results
          {candidates.length > 0 && <span className="badge">{candidates.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'search'}
          className={`cand-tab ${tab === 'search' ? 'active' : ''}`}
          onClick={() => setTab('search')}
        >
          Search
        </button>
      </div>

      {tab === 'recognition' ? (
        <>
          {cs?.lastTranscript ? (
            <div className="voice-transcript" title="Live speech transcript">
              “{cs.lastTranscript}”
              {cs.searching ? <span className="faint"> · searching…</span> : null}
            </div>
          ) : null}

          <div className="cand-table-wrap">
            <table className="cand-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Confidence</th>
                  <th>Reference</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="cand-empty">
                      No candidates yet — the engine proposes references; you confirm before
                      anything goes live.
                    </td>
                  </tr>
                )}
                {candidates.map((c, i) => {
                  const pct = Math.round(Math.max(0, Math.min(1, c.confidence)) * 100)
                  const conf =
                    pct >= 70 ? 'high' : pct >= 50 ? 'mid' : 'low'
                  return (
                    <tr
                      key={c.id}
                      className={i === activeIndex ? 'active' : ''}
                      onClick={() => void actions.selectCandidate(i)}
                    >
                      <td>
                        <span className={`kind-chip ${c.kind}`}>{c.kind}</span>
                      </td>
                      <td>
                        <span className={`conf ${conf}`}>
                          <span className="conf-dot" />
                          {pct}%
                        </span>
                      </td>
                      <td className="ref-cell">{c.reference}</td>
                      <td className="faint">{fmtTime(c.detectedAt)}</td>
                      <td>
                        {i === activeIndex ? (
                          <span className="pill">
                            <span className="dot ok" />
                            Selected
                          </span>
                        ) : (
                          <span className="faint">Candidate</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="cand-detail">
            {active ? (
              <>
                <div className="cand-detail-ref">
                  {active.reference}
                  <span className="trans">{active.translation}</span>
                </div>
                <div className="cand-detail-text">{active.snippet || active.text}</div>
                {active.kind === 'reference' && !active.snippet && (
                  <div className="faint">Awaiting passage text…</div>
                )}
              </>
            ) : (
              <div className="faint">Select a candidate to preview its passage.</div>
            )}
          </div>

          <div className="cand-actions">
            <button
              className="btn reject"
              disabled={!active}
              onClick={() => void actions.reject(active?.id)}
            >
              Reject
            </button>
            <button
              className="btn ghost"
              disabled={!active}
              onClick={() => void actions.confirm(active?.id)}
              title="Load into preview without presenting"
            >
              Preview
            </button>
            <button
              className="btn confirm"
              style={{ flex: 2 }}
              disabled={!active}
              onClick={() => void actions.confirm(active?.id)}
            >
              Confirm
            </button>
          </div>
          <div className="hint">
            <kbd>Enter</kbd> confirm · <kbd>Esc</kbd> reject · <kbd>↑</kbd>
            <kbd>↓</kbd> navigate · 5-minute expiry
          </div>
          <button className="link-btn" onClick={onOpenSearch}>
            View all results →
          </button>
        </>
      ) : (
        <>
          <div className="mini-search">
            <input
              placeholder="Search scripture — John 3:16, shepherd…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doSearch(query)
              }}
              spellCheck={false}
            />
            <button className="btn small" disabled={!query.trim()} onClick={() => void doSearch(query)}>
              {busy ? '…' : 'Search'}
            </button>
          </div>
          {response && response.results.length > 0 && (
            <div className="mini-results">
              {response.results.slice(0, 12).map((r) => (
                <div key={`${r.canonicalId}:${r.translation}`} className="mini-result">
                  <div className="mini-result-main">
                    <div className="result-ref">
                      {r.reference}
                      <span className="trans">{r.translation}</span>
                    </div>
                    <div className="result-text">{r.text}</div>
                  </div>
                  <div className="result-actions">
                    <button className="btn small ghost" onClick={() => void actions.preview(r.reference)}>
                      Preview
                    </button>
                    <button className="btn small primary" onClick={() => void actions.present(r.reference)}>
                      Present
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {response && response.results.length === 0 && (
            <div className="empty-state">
              <strong>No matches</strong>Try a book name, a reference, or fewer keywords.
            </div>
          )}
          {!response && (
            <div className="empty-state">
              <strong>Search the installed database</strong>
              Enter a reference or keywords and press Enter.
            </div>
          )}
        </>
      )}
    </section>
  )
}
