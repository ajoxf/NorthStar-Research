'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react'

import { PdfPage } from '@/components/pdf-page'
import { createPageSound, readSoundPreference, writeSoundPreference, type PageSound } from '@/lib/page-sound'
import { cn } from '@/lib/utils'
import { watermarkTile } from '@/lib/watermark'
import type { PdfDocument } from '@/lib/pdf-client'

/**
 * The report as a book.
 *
 * On anything wide enough it opens as a two-page spread with a gutter down the middle; on
 * a phone it is a single page that swipes. Both render from the real PDF, so charts and
 * layout arrive exactly as authored — the document is *shown*, never re-typeset. See the
 * note at the top of src/lib/pdf-sections.ts for why that distinction is load-bearing.
 *
 * **The turn.** A whole page lifts off the spine and swings across, revealing the next
 * one beneath it — forward it hinges on its left edge and sweeps left, back it hinges on
 * its right and sweeps right, which is what a bound page actually does. The leaf being
 * turned is a photograph of the page taken the instant before it changes, because
 * re-rendering a 20-megapixel canvas mid-animation would stutter. Its back face is
 * hidden, so at ninety degrees the leaf vanishes edge-on and the new page is already
 * there — no mirrored type, and no second render.
 *
 * The document is passed in rather than loaded here: the report page also mines it for
 * per-instrument charts, and fetching several megabytes twice on a phone is not
 * acceptable.
 */

/** Below this container width a spread would make each page too small to read. */
const SPREAD_MIN_WIDTH = 880

/**
 * Long enough to read as paper with weight, short enough not to be in the way.
 *
 * Coupled to the `page-turn-*` animations in globals.css, which this unmounts the leaf
 * at the end of. Change one and the other has to follow: shorter here and the sheet pops
 * out of existence mid-sweep, longer and it sits invisible while the reader waits.
 */
const TURN_MS = 700

type Turn = { image: string; dir: 'next' | 'prev' }

export function PdfFlipReader({
  doc,
  watermarkLabel,
}: {
  doc: PdfDocument
  watermarkLabel: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const leftCanvas = React.useRef<HTMLCanvasElement | null>(null)
  const rightCanvas = React.useRef<HTMLCanvasElement | null>(null)
  const turnTimer = React.useRef<number | null>(null)
  const sound = React.useRef<PageSound | null>(null)

  const [leaf, setLeaf] = React.useState(0)
  const [turn, setTurn] = React.useState<Turn | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [width, setWidth] = React.useState(0)
  // Starts silent and is corrected on mount: the preference lives in localStorage, which
  // the server cannot see, and guessing it would mean a hydration mismatch on the icon.
  const [soundOn, setSoundOn] = React.useState(false)

  React.useEffect(() => {
    setSoundOn(readSoundPreference())
    sound.current = createPageSound()
    return () => {
      sound.current?.close()
      sound.current = null
    }
  }, [])

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

  React.useEffect(
    () => () => {
      if (turnTimer.current) window.clearTimeout(turnTimer.current)
    },
    [],
  )

  // Read through a ref so toggling sound does not rebuild the turn handler, and with it
  // every key and swipe listener bound to it.
  const soundOnRef = React.useRef(soundOn)
  soundOnRef.current = soundOn

  const goToLeaf = React.useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(next, leafCount - 1))
      if (target === leaf) return

      const dir: 'next' | 'prev' = target > leaf ? 'next' : 'prev'
      // Forward, the page that leaves is the right-hand one; back, the left-hand one.
      const source = spread ? (dir === 'next' ? rightCanvas.current : leftCanvas.current) : leftCanvas.current

      setTurn(photograph(source, dir))
      setLeaf(target)
      if (soundOnRef.current) sound.current?.play()

      if (turnTimer.current) window.clearTimeout(turnTimer.current)
      turnTimer.current = window.setTimeout(() => setTurn(null), TURN_MS)
    },
    [leaf, leafCount, spread],
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

  // Dark fill: pages render on their own paper, so the pale tile used on the black
  // surfaces of the site would be invisible here.
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !soundOn
              setSoundOn(next)
              writeSoundPreference(next)
              // Play on enabling, so the choice is confirmed by the thing it controls.
              if (next) sound.current?.play()
            }}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute page turns' : 'Unmute page turns'}
            title={soundOn ? 'Mute page turns' : 'Unmute page turns'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
          >
            {soundOn ? (
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <VolumeX className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>

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
      </div>

      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative overflow-hidden rounded-xl border border-line bg-[#111]"
        style={{ perspective: '2600px' }}
      >
        {pageWidth > 0 && (
          <div className="flex" style={{ gap: gutter }}>
            <PdfPage
              doc={doc}
              pageNumber={firstPage}
              width={pageWidth}
              onCanvas={(canvas) => {
                leftCanvas.current = canvas
              }}
            />
            {spread && firstPage + 1 <= pageCount && (
              <PdfPage
                doc={doc}
                pageNumber={firstPage + 1}
                width={pageWidth}
                onCanvas={(canvas) => {
                  rightCanvas.current = canvas
                }}
              />
            )}
          </div>
        )}

        {/*
          The shadow the lifting sheet throws on the page underneath.

          A sibling rather than a child of the leaf: it belongs to the page being revealed,
          so it must not rotate with the sheet casting it.
        */}
        {turn && pageWidth > 0 && (
          <div
            className={cn(
              'page-turn-cast pointer-events-none absolute top-0 h-full',
              turn.dir === 'prev' && 'page-turn-cast-prev',
            )}
            style={{ width: pageWidth, ...(turn.dir === 'next' ? { right: 0 } : { left: 0 }) }}
            aria-hidden
          />
        )}

        {/* The turning leaf: the outgoing page, hinged on the spine, curling as it goes. */}
        {turn && pageWidth > 0 && (
          <div
            className={turn.dir === 'next' ? 'page-turn-next' : 'page-turn-prev'}
            style={{
              position: 'absolute',
              top: 0,
              width: pageWidth,
              height: '100%',
              // Forward the leaf occupies the right page and hinges left; back it occupies
              // the left page and hinges right.
              ...(turn.dir === 'next'
                ? { right: 0, transformOrigin: 'left center' }
                : { left: 0, transformOrigin: 'right center' }),
              transformStyle: 'preserve-3d',
              willChange: 'transform',
            }}
            aria-hidden
          >
            <CurledLeaf image={turn.image} width={pageWidth} dir={turn.dir} />
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
          className="mx-2 h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[#D6FD3A]"
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

/**
 * How many strips the turning sheet is cut into.
 *
 * Each one rotates by a fraction of the bend, nested inside the last, so the angles
 * accumulate outward from a spine that never moves — which is the only way to get a
 * curve out of CSS. A transform is affine: it cannot bend a plane, so a single element
 * can only ever pivot flat, and the one trick that fakes a lead — tilting the rotation
 * axis — does it by swinging the bound edge off centre, which books do not do.
 *
 * Twelve is where this stopped paying. Fewer and the arc is visibly faceted; more and
 * the seams between strips start to matter more than the curve does, on a sheet that is
 * on screen for two thirds of a second.
 */
const STRIPS = 12

/**
 * The outgoing page, cut into strips and curled.
 *
 * Every strip carries the same snapshot with its background offset by its own width, so
 * together they reassemble one image — nothing is re-rendered per strip, and the whole
 * sheet is still the single canvas photograph taken before the page changed.
 *
 * Built by folding from the outside in, because each strip has to be the *child* of the
 * one before it: nesting is what makes the rotations accumulate rather than all measuring
 * from the spine. Strip zero does not rotate at all — it is the sewn-in edge.
 *
 * Each strip is drawn a shade over its own width. Rotated neighbours otherwise leave
 * hairline gaps along every seam, which read as scratches across the page.
 */
function CurledLeaf({
  image,
  width,
  dir,
}: {
  image: string
  width: number
  dir: 'next' | 'prev'
}) {
  const strip = width / STRIPS
  const forward = dir === 'next'

  let node: React.ReactNode = null
  for (let i = STRIPS - 1; i >= 0; i--) {
    const child = node
    node = (
      <div
        key={i}
        className={cn(
          'absolute top-0 h-full',
          // The spine strip is glued; every other one bends relative to its neighbour.
          i > 0 && (forward ? 'page-turn-curl' : 'page-turn-curl-prev'),
        )}
        style={{
          width: strip + 0.7,
          ...(forward
            ? { left: i === 0 ? 0 : strip, transformOrigin: 'left center' }
            : { right: i === 0 ? 0 : strip, transformOrigin: 'right center' }),
          backgroundImage: `url(${image})`,
          backgroundSize: `${width}px 100%`,
          backgroundPosition: `${forward ? -i * strip : -(STRIPS - 1 - i) * strip}px 0`,
          backgroundRepeat: 'no-repeat',
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
        }}
      >
        {child}
        {/*
          Light across this strip.

          Per strip rather than one gradient over the whole sheet, because on a curved
          surface each band faces the light differently — that difference is most of what
          makes a curve read as a curve rather than as a picture of one. Outer strips sit
          deeper in shadow, which is also where the sheet is standing furthest off the
          spread.
        */}
        <div
          className="page-turn-shade pointer-events-none absolute inset-0"
          style={{ opacity: undefined, backgroundColor: `rgba(0,0,0,${0.06 + (i / STRIPS) * 0.5})` }}
        />
      </div>
    )
  }

  return <>{node}</>
}

/**
 * Snapshot a rendered page so it can be animated cheaply.
 *
 * Deliberately downscaled and JPEG: the source canvas is rendered well above display
 * resolution for zooming, and encoding that at full size would cost more than the turn
 * it is meant to smooth. It is on screen for a third of a second, mostly at an angle.
 */
function photograph(canvas: HTMLCanvasElement | null, dir: 'next' | 'prev'): Turn | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null

  const scale = Math.min(1, 1000 / canvas.width)
  const flat = document.createElement('canvas')
  flat.width = Math.max(1, Math.round(canvas.width * scale))
  flat.height = Math.max(1, Math.round(canvas.height * scale))

  const context = flat.getContext('2d')
  if (!context) return null

  context.drawImage(canvas, 0, 0, flat.width, flat.height)

  try {
    return { image: flat.toDataURL('image/jpeg', 0.78), dir }
  } catch {
    // A tainted canvas cannot be read back. The page still changes; only the turn is lost.
    return null
  }
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
