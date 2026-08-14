'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'

import { PdfPage } from '@/components/pdf-page'
import { cn } from '@/lib/utils'
import { watermarkTile } from '@/lib/watermark'
import type { PdfDocument } from '@/lib/pdf-client'

/**
 * The report as a book.
 *
 * On anything wide enough it opens as a two-page spread with a gutter down the middle and
 * a leaf that swings across on the turn; on a phone it is a single page that swipes. Both
 * are the same document rendered from the real PDF, so charts and layout arrive exactly
 * as authored — the document is *shown*, never re-typeset. See the note at the top of
 * src/lib/pdf-sections.ts for why that distinction is load-bearing.
 *
 * The document is passed in rather than loaded here: the report page also mines it for
 * per-instrument charts, and fetching several megabytes twice on a phone is not
 * acceptable.
 */

/** Below this container width a spread would make each page too small to read. */
const SPREAD_MIN_WIDTH = 880

export function PdfFlipReader({
  doc,
  watermarkLabel,
}: {
  doc: PdfDocument
  watermarkLabel: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  const [leaf, setLeaf] = React.useState(0)
  const [turning, setTurning] = React.useState<'none' | 'next' | 'prev'>('none')
  const [expanded, setExpanded] = React.useState(false)
  const [width, setWidth] = React.useState(0)

  const pageCount = doc.numPages
  const spread = width >= SPREAD_MIN_WIDTH && pageCount > 1
  const perLeaf = spread ? 2 : 1
  const leafCount = Math.ceil(pageCount / perLeaf)
  const firstPage = leaf * perLeaf + 1

  // Track container width so pages re-render crisply on resize and rotation, and so the
  // layout can drop from a spread to a single page when the window narrows.
  React.useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Keep the reader on the same page when the layout switches between one page and two.
  const perLeafRef = React.useRef(perLeaf)
  React.useEffect(() => {
    if (perLeafRef.current === perLeaf) return
    const page = leaf * perLeafRef.current + 1
    perLeafRef.current = perLeaf
    setLeaf(Math.floor((page - 1) / perLeaf))
  }, [leaf, perLeaf])

  const goToLeaf = React.useCallback(
    (next: number) => {
      if (next < 0 || next >= leafCount || next === leaf) return
      setTurning(next > leaf ? 'next' : 'prev')
      setLeaf(next)
      // Matches the CSS transition; purely cosmetic, so a missed timeout is harmless.
      window.setTimeout(() => setTurning('none'), 420)
    },
    [leaf, leafCount],
  )

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') goToLeaf(leaf + 1)
      if (event.key === 'ArrowLeft') goToLeaf(leaf - 1)
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToLeaf, leaf])

  const touchStart = React.useRef<number | null>(null)
  function onTouchStart(event: React.TouchEvent) {
    touchStart.current = event.touches[0]?.clientX ?? null
  }
  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current
    const end = event.changedTouches[0]?.clientX
    touchStart.current = null
    if (start === null || end === undefined) return

    const delta = end - start
    if (Math.abs(delta) < 45) return
    goToLeaf(delta < 0 ? leaf + 1 : leaf - 1)
  }

  // Dark fill: pages render on their own white paper, so the pale tile used on the black
  // surfaces would be invisible here.
  const watermarkStyle = React.useMemo(
    () => ({ backgroundImage: watermarkTile(watermarkLabel, '#000000') }) as React.CSSProperties,
    [watermarkLabel],
  )

  // Gutter is a real gap between two bound pages, so each page gets half of what is left.
  const gutter = spread ? 2 : 0
  const pageWidth = Math.max(0, Math.floor((width - gutter) / perLeaf))
  const lastPage = Math.min(firstPage + perLeaf - 1, pageCount)

  return (
    <div className={cn(expanded && 'fixed inset-0 z-50 overflow-auto bg-bg p-3 sm:p-6')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {firstPage === lastPage
            ? `Page ${firstPage} of ${pageCount}`
            : `Pages ${firstPage}–${lastPage} of ${pageCount}`}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          {expanded ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              Close
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              Full screen
            </>
          )}
        </button>
      </div>

      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative overflow-hidden rounded-xl border border-line bg-[#111]"
        style={{ perspective: '2400px' }}
      >
        {pageWidth > 0 && (
          <div
            className={cn(
              'book-leaf flex',
              turning === 'next' && 'book-leaf-next',
              turning === 'prev' && 'book-leaf-prev',
            )}
            style={{ gap: gutter, transformOrigin: spread ? 'center left' : 'left center' }}
          >
            <PdfPage doc={doc} pageNumber={firstPage} width={pageWidth} />
            {spread && firstPage + 1 <= pageCount && (
              <PdfPage doc={doc} pageNumber={firstPage + 1} width={pageWidth} />
            )}
          </div>
        )}

        {/* The binding: a soft shadow down the centre so a spread reads as one open book
            rather than two pages parked next to each other. */}
        {spread && (
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 w-10 -translate-x-1/2"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.20) 42%, rgba(0,0,0,0.32) 50%, rgba(0,0,0,0.20) 58%, rgba(0,0,0,0) 100%)',
            }}
            aria-hidden
          />
        )}

        {/* Watermark over the paper, tying any screenshot to an account. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={watermarkStyle}
          aria-hidden
        />

        {/* Generous tap targets on the outer edges — where a thumb naturally falls. */}
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => goToLeaf(leaf - 1)}
          disabled={leaf <= 0}
          className="absolute inset-y-0 left-0 w-[14%] cursor-w-resize disabled:cursor-default"
        />
        <button
          type="button"
          aria-label="Next page"
          onClick={() => goToLeaf(leaf + 1)}
          disabled={leaf >= leafCount - 1}
          className="absolute inset-y-0 right-0 w-[14%] cursor-e-resize disabled:cursor-default"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <PagerButton onClick={() => goToLeaf(leaf - 1)} disabled={leaf <= 0} label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </PagerButton>

        <input
          type="range"
          min={1}
          max={Math.max(leafCount, 1)}
          value={leaf + 1}
          onChange={(event) => goToLeaf(Number(event.target.value) - 1)}
          aria-label="Jump to page"
          className="mx-2 h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[#D0F53C]"
        />

        <PagerButton
          onClick={() => goToLeaf(leaf + 1)}
          disabled={leaf >= leafCount - 1}
          label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </PagerButton>
      </div>
    </div>
  )
}

function PagerButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-line px-4',
        'text-[13px] text-ink transition-colors',
        'hover:border-accent/50 disabled:opacity-35 disabled:hover:border-line',
      )}
    >
      {children}
    </button>
  )
}
