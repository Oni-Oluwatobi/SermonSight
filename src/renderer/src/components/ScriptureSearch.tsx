import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, SearchResponse, SearchResultItem } from '@shared/ipc'
import { referenceParser } from '@core/recognition/ReferenceParser'
import { actions, showToast } from '../state/store'
import { MonitorIcon, SearchGlassIcon } from './icons/DesignIcons'

type TestamentFilter = 'all' | 'OT' | 'NT'

const FILTERS: { id: TestamentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'OT', label: 'Old Testament' },
  { id: 'NT', label: 'New Testament' }
]

function testamentOf(result: SearchResultItem): 'OT' | 'NT' | null {
  const parsed = referenceParser.parseFirst(result.reference)
  return parsed ? parsed.book.testament : null
}

function tagOf(result: SearchResultItem): string {
  const testament = testamentOf(result)
  return testament === 'OT' ? 'Old Testament' : testament === 'NT' ? 'New Testament' : ''
}

export function ScriptureSearch({ state }: { state: AppState | null }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TestamentFilter>('all')
  const [selected, setSelected] = useState(0)
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const dbReady = state?.db.state === 'loaded'

  const doSearch = useCallback(
    async (q: string): Promise<void> => {
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
        /* keep the previous results on a transient failure */
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    },
    [dbReady, state?.translation]
  )

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      void doSearch('')
      return undefined
    }
    const timer = setTimeout(() => void doSearch(trimmed), 220)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [])

  const visible = useMemo(() => {
    const results = response?.results ?? []
    if (filter === 'all') return results
    return results.filter((result) => testamentOf(result) === filter)
  }, [response, filter])

  useEffect(() => {
    setSelected(0)
  }, [response, filter])

  const activeIndex = visible.length === 0 ? -1 : Math.min(selected, visible.length - 1)
  const activeResult = activeIndex >= 0 ? visible[activeIndex] : null

  useEffect(() => {
    if (activeIndex < 0) return
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const moveSelection = useCallback(
    (delta: number) => {
      if (visible.length === 0) return
      setSelected((current) => (current + delta + visible.length) % visible.length)
    },
    [visible.length]
  )

  const presentActive = useCallback(() => {
    if (activeResult) void actions.present(activeResult.reference)
  }, [activeResult])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) return
      event.preventDefault()
      if (activeResult) presentActive()
      else void doSearch(query)
    }
  }

  const translationName = (abbreviation: string): string =>
    state?.db.translations.find((entry) => entry.abbreviation === abbreviation)?.name ??
    abbreviation

  return (
    <div className="ss-root" onKeyDown={onKeyDown}>
      <div className="ss-top">
        <div className="ss-field" onClick={() => inputRef.current?.focus()}>
          <SearchGlassIcon className="ss-glass" />
          <input
            ref={inputRef}
            className="ss-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder=""
            spellCheck={false}
            aria-label="Search Scripture by reference or keyword"
          />
          <span
            className="ss-hint"
            onClick={() => inputRef.current?.focus()}
            aria-hidden="true"
          >
            Search by reference or keyword
          </span>
        </div>
        <div className="ss-filters">
          <div className="ss-chips" role="group" aria-label="Filter results by testament">
            {FILTERS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`ss-chip${filter === chip.id ? ' is-active' : ''}`}
                aria-pressed={filter === chip.id}
                onClick={() => setFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {response ? (
            <span className="ss-count">
              {visible.length} result{visible.length === 1 ? '' : 's'} · {response.translation}
              {response.truncated ? ' · truncated' : ''}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ss-body">
        <div className="ss-results" ref={listRef} aria-busy={busy}>
          {visible.length === 0 ? (
            <div className="empty-state ss-empty">
              <strong>{response ? 'No matches' : 'Search the installed Scripture database'}</strong>
              {response ? (
                <>
                  Try a book name, a reference like <em>John 3:16–18</em>, or fewer keywords.
                </>
              ) : !dbReady ? (
                'Search becomes available once a valid sermonsight.ss database is loaded.'
              ) : (
                'Examples: “John 3”, “Deuteronomy 6:4”, “shepherd”, “for God so loved”'
              )}
            </div>
          ) : (
            visible.map((result, index) => (
              <button
                key={`${result.canonicalId}:${result.translation}`}
                type="button"
                data-index={index}
                className={`ss-card${index === activeIndex ? ' is-selected' : ''}`}
                aria-pressed={index === activeIndex}
                onClick={() => setSelected(index)}
              >
                <span className="ss-card-top">
                  <span className="ss-card-ref">{result.reference}</span>
                  <span className="ss-card-tag">{tagOf(result)}</span>
                </span>
                <span className="ss-card-snippet">{result.text}</span>
              </button>
            ))
          )}
        </div>

        <div className="ss-preview">
          <div className="ss-preview-head">
            <span className="ss-preview-label">VERSE PREVIEW</span>
            {activeResult ? (
              <span className="ss-preview-badge">{activeResult.translation}</span>
            ) : null}
          </div>
          {activeResult ? (
            <>
              <h3 className="ss-preview-ref">{activeResult.reference}</h3>
              <p className="ss-preview-text">{activeResult.text}</p>
              <p className="ss-preview-note">{translationName(activeResult.translation)}</p>
            </>
          ) : (
            <p className="ss-preview-placeholder">Select a result to preview it here.</p>
          )}
          <div className="ss-preview-actions">
            <button
              type="button"
              className="ss-btn"
              disabled={!activeResult}
              onClick={() => {
                if (activeResult) void actions.preview(activeResult.reference)
              }}
              title="Load the selected passage into the preview pane"
            >
              <MonitorIcon />
              <span>Preview</span>
            </button>
            <button
              type="button"
              className="ss-btn primary"
              disabled={!activeResult}
              onClick={presentActive}
              title="Send the selected passage to the live output"
            >
              + Add to Presentation
            </button>
          </div>
        </div>
      </div>

      <div className="ss-footer">
        <span>Local scripture library · Available offline</span>
        <span className="ss-footer-hints">
          <span>↑↓ Select</span>
          <span>↵ Add</span>
          <span>Esc Close</span>
        </span>
      </div>
    </div>
  )
}
