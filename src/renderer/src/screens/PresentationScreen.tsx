import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IPC, type AppState } from '@shared/ipc'
import { THEMES, presentationStyles, referenceStyles } from '@core/presentation/themes'

/**
 * Audience-facing output. No controls, no transcript, no confidence scores —
 * only confirmed scripture (or black).
 *
 * Long passages are paginated: a hidden measurer renders the full verse list
 * with identical styles, packs verses greedily into pages that fit the window
 * (verses never split across pages), and reports the page count to main so
 * every control path (keyboard, dashboard, phone remote) pages transparently.
 */
export function PresentationScreen(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [ranges, setRanges] = useState<[number, number][] | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const presRef = useRef<HTMLDivElement | null>(null)
  const measureBodyRef = useRef<HTMLDivElement | null>(null)
  const measureVersesRef = useRef<HTMLDivElement | null>(null)
  const measureRefRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const off = window.api.on(IPC.STATE_UPDATE, (s) => setState(s as AppState))
    void window.api
      .invoke<AppState>(IPC.STATE_GET)
      .then(setState)
      .catch(() => undefined)
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      off()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const meta = state?.presentation
  const live = state?.live ?? null
  const black = state?.black ?? false
  const themeId = meta?.theme ?? 'classic'
  const theme = THEMES[themeId] ?? THEMES.classic
  const opts = { theme: themeId, fontSizePct: meta?.fontSizePct ?? 100 }
  const body = presentationStyles(opts)
  const ref = referenceStyles(opts)
  const refAtTop = theme.referencePosition === 'top'
  const showRef = meta?.showReference ?? true

  useLayoutEffect(() => {
    if (black || !live || live.verses.length === 0 || viewport.h === 0) {
      setRanges(null)
      return
    }
    const box = measureBodyRef.current
    const verses = measureVersesRef.current
    const refBlock = measureRefRef.current
    if (!box || !verses) return
    const verseEls = Array.from(verses.children) as HTMLElement[]
    if (verseEls.length === 0) return

    const vh = viewport.h
    const padBottom = vh * 0.07
    const badgeZone = vh * 0.04
    let bottomExtra = vh * 0.05 // safety under reference/badge
    if (!refAtTop && showRef && refBlock) {
      bottomExtra = refBlock.getBoundingClientRect().height + vh * 0.03 + vh * 0.04
    }
    const top = verseEls[0].offsetTop
    const bottomLimit = box.clientHeight - padBottom - bottomExtra
    const capacity = bottomLimit - top

    const packed: [number, number][] = []
    let start = 0
    for (let i = 0; i < verseEls.length; i++) {
      const fits =
        verseEls[i].offsetTop + verseEls[i].offsetHeight - verseEls[start].offsetTop <= capacity
      if (!fits && i > start) {
        packed.push([start, i - 1])
        start = i
      }
    }
    packed.push([start, verseEls.length - 1])
    setRanges(packed)
  }, [live, black, themeId, opts.fontSizePct, showRef, refAtTop, viewport])

  // Report/clamp the page window in main (main owns page + pageCount).
  useLayoutEffect(() => {
    if (!ranges) return
    const count = ranges.length
    const curPage = meta?.page ?? 0
    const curCount = meta?.pageCount ?? 1
    if (curCount !== count || curPage > count - 1) {
      const page = Math.min(curPage, count - 1)
      window.api.send(IPC.PRESENTATION_PAGE, page, count)
    }
  }, [ranges, meta?.page, meta?.pageCount])

  const pageCount = ranges?.length ?? 1
  const page = Math.min(Math.max(0, meta?.page ?? 0), pageCount - 1)
  const slice = ranges
    ? (live?.verses.slice(ranges[page][0], ranges[page][1] + 1) ?? [])
    : (live?.verses ?? [])

  const refBlock = (
    <div className="pres-ref" style={ref}>
      {live?.reference}
      {meta?.showTranslationBadge && (
        <span style={{ opacity: 0.75, marginLeft: '0.6em' }}>{live?.translation}</span>
      )}
    </div>
  )

  const allVerses =
    live?.verses.map((v) => (
      <span className="pres-verse" key={v.canonicalId}>
        <span className="num">{v.reference.split(' ').pop()}</span>
        {v.text}
      </span>
    )) ?? []

  return (
    <div
      className={`pres ${black ? 'blackout' : ''}`}
      ref={presRef}
      style={
        (black
          ? undefined
          : {
              background: theme.background,
              color: theme.color,
              ['--num-color' as string]: theme.referenceColor
            }) as React.CSSProperties
      }
    >
      {!black && live && live.verses.length > 0 && (
        <>
          <div
            className={`pres-body ${theme.align === 'center' ? 'align-center' : 'align-left'}`}
            style={body}
          >
            {refAtTop && showRef && refBlock}
            <div className="pres-verses">
              {slice.map((v) => (
                <span className="pres-verse" key={v.canonicalId}>
                  <span className="num">{v.reference.split(' ').pop()}</span>
                  {v.text}
                </span>
              ))}
            </div>
            {!refAtTop && showRef && <div style={{ marginTop: '3vh' }}>{refBlock}</div>}
          </div>

          {/* Hidden full-passage measurer — identical box, styles and wrap width. */}
          <div
            className="pres-body pres-measure"
            aria-hidden
            ref={measureBodyRef}
            style={{ ...body, textAlign: theme.align }}
          >
            {refAtTop && showRef && (
              <div className="pres-ref" ref={measureRefRef} style={ref}>
                {live.reference}
              </div>
            )}
            <div className="pres-verses" ref={measureVersesRef}>
              {allVerses}
            </div>
            {!refAtTop && showRef && (
              <div className="pres-ref" ref={measureRefRef} style={{ ...ref, marginTop: '3vh' }}>
                {live.reference}
              </div>
            )}
          </div>

          <div className="pres-badge" style={{ color: ref.color, fontFamily: ref.fontFamily }}>
            SERMONSIGHT
          </div>
          {pageCount > 1 && (
            <div className="pres-pagenum" style={{ color: ref.color, fontFamily: ref.fontFamily }}>
              {page + 1} / {pageCount}
            </div>
          )}
        </>
      )}
    </div>
  )
}
