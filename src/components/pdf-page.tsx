'use client'

import * as React from 'react'

import type { PdfDocument, PdfTextItem } from '@/lib/pdf-client'

/**
 * One rendered PDF page, with the numbers in neon green.
 *
 * The page is a canvas — the document exactly as authored, charts and all. Over each
 * numeric run sits a lime rectangle in a blend mode chosen so that only the *glyphs*
 * change colour and the paper behind them does not:
 *
 *   - on a dark page, `multiply` — white type × lime = lime, near-black paper × lime is
 *     still near-black;
 *   - on light paper, `screen` — dark type ∪ lime = lime, white paper ∪ lime is still
 *     white.
 *
 * So the numbers come out neon green either way, with no highlighter block behind them,
 * and without re-drawing a single glyph: the type keeps the document's own font, weight
 * and kerning, because it is still the document's own type underneath.
 *
 * Positions come from pdf.js's own text layer geometry — the data that drives text
 * selection — so the marks land on the glyphs rather than near them.
 */
/**
 * Supersampling factor above the device pixel ratio.
 *
 * A report is read by zooming into a level or opening a page full screen, and a canvas
 * rendered at exactly 1 device pixel per CSS pixel goes soft the moment either happens.
 * Rendering above the display's resolution keeps the type crisp through both.
 */
const SUPERSAMPLE = 2

/**
 * Ceiling on total canvas pixels. Browsers refuse to allocate a canvas beyond a few tens
 * of megapixels — Safari on iOS most aggressively — and a refused canvas is a blank page,
 * so the scale is pulled back to fit rather than gambling on the limit.
 */
const MAX_CANVAS_PIXELS = 24_000_000

export function PdfPage({
  doc,
  pageNumber,
  width,
  className,
  onCanvas,
}: {
  doc: PdfDocument
  pageNumber: number
  /** CSS width in pixels. The canvas is rendered well above this — see SUPERSAMPLE. */
  width: number
  className?: string
  /** Handed the painted canvas, so a page turn can photograph it before it changes. */
  onCanvas?: (canvas: HTMLCanvasElement) => void
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const renderTaskRef = React.useRef<{ cancel: () => void } | null>(null)
  // Held in a ref so a caller passing an inline callback does not re-trigger the render.
  const onCanvasRef = React.useRef(onCanvas)
  onCanvasRef.current = onCanvas
  const [marks, setMarks] = React.useState<NumberMark[]>([])
  const [ratio, setRatio] = React.useState(1.414)
  const [dark, setDark] = React.useState(true)

  React.useEffect(() => {
    if (width <= 0) return
    let cancelled = false

    async function render() {
      const canvas = canvasRef.current
      if (!canvas) return

      // Cancel any in-flight render first — rapid page turns otherwise paint out of order.
      renderTaskRef.current?.cancel()

      const page = await doc.getPage(pageNumber)
      if (cancelled) return

      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      let scale = (width / base.width) * dpr * SUPERSAMPLE
      const pixels = base.width * scale * (base.height * scale)
      if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)

      const viewport = page.getViewport({ scale })

      const context = canvas.getContext('2d')
      if (!context) return

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      setRatio(base.height / base.width)

      const task = page.render({ canvasContext: context, viewport })
      renderTaskRef.current = task

      try {
        await task.promise
      } catch {
        // A cancelled render is expected during fast paging, not an error.
        return
      }
      if (cancelled) return

      onCanvasRef.current?.(canvas)
      setDark(isDarkPage(canvas))

      // Marks are positioned in CSS pixels, so they are computed against the unscaled
      // viewport rather than the device-resolution one.
      const cssViewport = page.getViewport({ scale: width / base.width })
      const content = await page.getTextContent()
      if (cancelled) return

      setMarks(numberMarks(content.items, cssViewport))
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, width])

  return (
    <div
      className={className}
      style={{ position: 'relative', width, aspectRatio: `1 / ${ratio}`, background: '#FFFFFF' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {marks.map((mark, index) => (
          <span
            key={`${mark.left}-${mark.top}-${index}`}
            style={{
              position: 'absolute',
              left: mark.left,
              top: mark.top,
              width: mark.width,
              height: mark.height,
              background: 'var(--accent)',
              // See the note at the top: the blend is what recolours the type instead of
              // covering it, and which one does that depends on the page's own tone.
              mixBlendMode: dark ? 'multiply' : 'screen',
            }}
          />
        ))}
      </div>
    </div>
  )
}

type NumberMark = { left: number; top: number; width: number; height: number }

/**
 * Whether a rendered page is set on dark paper.
 *
 * Median rather than mean luminance, sampled small: a chart page carries large white
 * chart captures over a dark background, and a mean would call that page light and pick
 * the wrong blend for every number on it. The median tracks the background, which is
 * what the highlight has to sit on.
 */
export function isDarkPage(canvas: HTMLCanvasElement): boolean {
  const sample = document.createElement('canvas')
  sample.width = 24
  sample.height = 32

  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return false

  context.drawImage(canvas, 0, 0, sample.width, sample.height)
  const { data } = context.getImageData(0, 0, sample.width, sample.height)

  const luminance: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    luminance.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
  }

  luminance.sort((a, b) => a - b)
  return luminance[Math.floor(luminance.length / 2)] < 128
}

/**
 * Every number inside a run of text, with the character offsets it spans.
 *
 * A price, a level, a percentage or a rate range — the things a reader of this product
 * came for. Deliberately not matched: a year on its own, and anything glued to letters,
 * so `August 13, 2026` and `H1` are left alone. Marking a date would dilute the marking.
 */
export function findNumbers(value: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = []
  // A number, optionally signed, with thousands separators, decimals, a range partner and
  // a trailing unit — 99.384, 4,357, 3.50–3.75%, +0.2%, 24,602.
  const pattern = /[+-]?\d[\d,]*(?:\.\d+)?(?:\s*[–—-]\s*[+-]?\d[\d,]*(?:\.\d+)?)?%?/g

  for (const match of value.matchAll(pattern)) {
    const text = match[0]
    const start = match.index ?? 0
    const end = start + text.length

    const before = value.slice(Math.max(0, start - 12), start)
    const after = value.slice(end, end + 8)

    // Glued to a word — part of a code or an identifier, not a level.
    if (/[A-Za-z]$/.test(before) || /^[A-Za-z]/.test(after)) continue
    // Hyphenated into a word: `4-hour`, `1-hour`, `50-day`.
    if (/^[–—-][A-Za-z]/.test(after)) continue
    // A bare single digit is a bullet, a footnote or a page number far more often than a
    // level. Anything carrying a decimal, a separator or a unit is kept.
    if (/^\d$/.test(text)) continue
    // Dates. A year is not a level, and neither is the day beside a month.
    if (/^(19|20)\d{2}$/.test(text)) continue
    if (MONTH.test(before)) continue

    found.push({ start, end })
  }

  return found
}

const MONTH =
  /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+$/

function numberMarks(
  items: PdfTextItem[],
  viewport: { transform: number[]; scale: number },
): NumberMark[] {
  const marks: NumberMark[] = []
  const ruler = document.createElement('canvas').getContext('2d')

  for (const item of items) {
    if (!item.transform || item.transform.length < 6) continue

    const numbers = findNumbers(item.str)
    if (numbers.length === 0) continue

    // Compose the item's text matrix with the viewport's, as pdf.js's own text layer
    // does. The result's translation is the glyph origin — the baseline, so the box is
    // lifted by the font height to cover the glyphs rather than sit under them.
    const t = multiply(viewport.transform, item.transform)
    const fontHeight = Math.hypot(t[2], t[3])
    if (fontHeight <= 0) continue

    const runWidth = (item.width ?? 0) * viewport.scale
    if (runWidth <= 0) continue

    // Cap height at the glyphs themselves. Padding used to soften a highlighter block;
    // now that the mark recolours type, anything overhanging tints the paper instead.
    const top = t[5] - fontHeight * 0.92
    const height = fontHeight * 1.02

    // Whole run is one number: exact box, straight from pdf.js's geometry.
    if (numbers.length === 1 && numbers[0].start === 0 && numbers[0].end === item.str.length) {
      marks.push({ left: t[4], top, width: runWidth, height })
      continue
    }

    // Otherwise the number sits inside a sentence, and pdf.js gives a box for the run
    // rather than per-character positions. Offsets are measured in a substitute font and
    // then scaled so the measured whole matches the run's true width — an approximation,
    // but a soft highlight a pixel or two out still reads correctly, and leaving every
    // level inside the prose unmarked would miss most of what a reader is here for.
    if (!ruler) continue
    ruler.font = `${fontHeight}px ui-sans-serif, system-ui, sans-serif`

    const measured = ruler.measureText(item.str).width
    if (measured <= 0) continue
    const correction = runWidth / measured

    for (const { start, end } of numbers) {
      const left = t[4] + ruler.measureText(item.str.slice(0, start)).width * correction
      const width = ruler.measureText(item.str.slice(start, end)).width * correction
      if (width <= 0) continue
      marks.push({ left, top, width, height })
    }
  }

  return marks
}

/** 2D affine matrix product, in the [a, b, c, d, e, f] order pdf.js uses. */
function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}
