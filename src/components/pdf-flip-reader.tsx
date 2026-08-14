'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, FileWarning, Loader2, Maximize2, Minimize2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { watermarkTile } from '@/lib/watermark'

/**
 * Page-by-page PDF reader with a flip transition.
 *
 * This renders the actual PDF pages to canvas, so charts, tables and layout arrive
 * exactly as they were authored. That is the point: an earlier approach extracted the
 * text layer instead, which dropped every chart and mangled price tables into runs like
 * `DXY 101.977100.365100.020`. On a research product the levels *are* the product, so
 * the document is shown, not re-typeset.
 *
 * Access is unchanged: the bytes come from a short-lived signed URL bound to one member
 * and one report, fetched into memory and never exposed as a shareable link.
 *
 * Mobile is a first-class case, not a fallback — swipe to turn, pages sized to the
 * container width, and controls large enough to hit with a thumb.
 */

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function PdfFlipReader({
  reportId,
  watermarkLabel,
}: {
  reportId: string
  watermarkLabel: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  // Held in a ref, not state: the document is large and must never trigger a re-render.
  const docRef = React.useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(
    null,
  )
  const renderTaskRef = React.useRef<{ cancel: () => void } | null>(null)

  const [state, setState] = React.useState<LoadState>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [pageCount, setPageCount] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [flip, setFlip] = React.useState<'none' | 'next' | 'prev'>('none')
  const [expanded, setExpanded] = React.useState(false)
  const [width, setWidth] = React.useState(0)

  // Track container width so pages re-render crisply on resize and rotation.
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

  // Load the document once.
  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setState('loading')
      setError(null)

      try {
        const response = await fetch(`/api/reports/${reportId}/view-url`, { method: 'POST' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not open the document.')

        const pdfjs = await import('pdfjs-dist')
        // Served from our own origin, copied into /public at build time by
        // scripts/copy-pdf-worker.mjs. Never a CDN: paid research must not fail to
        // render because a third-party host is slow or blocked.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const bytes = await (await fetch(data.url)).arrayBuffer()
        if (cancelled) return

        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
        if (cancelled) return

        docRef.current = doc as never
        setPageCount(doc.numPages)
        setPage(1)
        setState('ready')
      } catch (err) {
        if (cancelled) return
        console.error('[pdf-reader]', err)
        setError(err instanceof Error ? err.message : 'Could not open the document.')
        setState('error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reportId])

  // Render the current page whenever it, or the available width, changes.
  React.useEffect(() => {
    if (state !== 'ready' || !docRef.current || width === 0) return

    let cancelled = false

    async function render() {
      const doc = docRef.current
      const canvas = canvasRef.current
      if (!doc || !canvas) return

      // Cancel any in-flight render before starting another — rapid page turns
      // otherwise paint out of order.
      renderTaskRef.current?.cancel()

      const pdfPage = (await doc.getPage(page)) as {
        getViewport: (o: { scale: number }) => { width: number; height: number }
        render: (o: unknown) => { promise: Promise<void>; cancel: () => void }
      }
      if (cancelled) return

      const base = pdfPage.getViewport({ scale: 1 })
      // Cap the device pixel ratio: a 3x phone screen on a large page produces a canvas
      // big enough to be refused by the browser.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (width / base.width) * dpr
      const viewport = pdfPage.getViewport({ scale })

      const context = canvas.getContext('2d')
      if (!context) return

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = '100%'
      canvas.style.height = 'auto'

      const task = pdfPage.render({ canvasContext: context, viewport })
      renderTaskRef.current = task

      try {
        await task.promise
      } catch {
        // A cancelled render is expected during fast paging, not an error.
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [state, page, width])

  const goTo = React.useCallback(
    (next: number) => {
      if (next < 1 || next > pageCount || next === page) return
      setFlip(next > page ? 'next' : 'prev')
      setPage(next)
      // Matches the CSS transition below; purely cosmetic, so a missed timeout is harmless.
      window.setTimeout(() => setFlip('none'), 260)
    },
    [page, pageCount],
  )

  // Keyboard paging.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') goTo(page + 1)
      if (event.key === 'ArrowLeft') goTo(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, page])

  // Swipe paging for touch.
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
    goTo(delta < 0 ? page + 1 : page - 1)
  }

  // Dark fill: PDF pages render on their own white paper, so the pale tile used on the
  // black surfaces would be invisible here.
  const watermarkStyle = React.useMemo(
    () => ({ backgroundImage: watermarkTile(watermarkLabel, '#000000') }) as React.CSSProperties,
    [watermarkLabel],
  )

  if (state === 'error') {
    return (
      <div className="panel flex flex-col items-center px-6 py-14 text-center">
        <FileWarning className="mb-4 h-6 w-6 text-down" aria-hidden />
        <h3 className="font-display text-lg text-ink">This document could not be opened</h3>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-dim">{error}</p>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-dim">
          Reload the page to try again — view links expire after a few minutes.
        </p>
      </div>
    )
  }

  return (
    <div className={cn(expanded && 'fixed inset-0 z-50 overflow-auto bg-bg p-3 sm:p-6')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {state === 'ready' ? `Page ${page} of ${pageCount}` : 'Loading document…'}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
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
        className="relative overflow-hidden rounded-xl border border-line bg-white"
        style={{ perspective: '2000px' }}
      >
        {state !== 'ready' && (
          <div className="flex aspect-[1/1.414] items-center justify-center bg-panel">
            <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
          </div>
        )}

        <div
          className={cn(
            'page-leaf origin-left transition-transform duration-300 ease-out',
            flip === 'next' && 'page-leaf-next',
            flip === 'prev' && 'page-leaf-prev',
            state !== 'ready' && 'hidden',
          )}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <canvas ref={canvasRef} className="block w-full" />

          {/* Watermark sits above the rendered page, tying any screenshot to an account. */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={watermarkStyle}
            aria-hidden
          />
        </div>

        {/* Generous tap targets on the page edges — the natural place to reach on a phone. */}
        {state === 'ready' && (
          <>
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              className="absolute inset-y-0 left-0 w-[18%] cursor-w-resize disabled:cursor-default"
            />
            <button
              type="button"
              aria-label="Next page"
              onClick={() => goTo(page + 1)}
              disabled={page >= pageCount}
              className="absolute inset-y-0 right-0 w-[18%] cursor-e-resize disabled:cursor-default"
            />
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <PagerButton onClick={() => goTo(page - 1)} disabled={page <= 1} label="Previous">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </PagerButton>

        <input
          type="range"
          min={1}
          max={Math.max(pageCount, 1)}
          value={page}
          onChange={(event) => goTo(Number(event.target.value))}
          aria-label="Jump to page"
          className="mx-2 h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[#D0F53C]"
        />

        <PagerButton onClick={() => goTo(page + 1)} disabled={page >= pageCount} label="Next">
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
