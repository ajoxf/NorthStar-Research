'use client'

import {
  paintImageOp,
  resolveImageObject,
  type PdfDocument,
  type PdfImage,
  type PdfPage,
  type PdfTextItem,
} from '@/lib/pdf-client'

/**
 * Pull the charts out of a report PDF and group them by instrument.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE EXTENDING IT
 * ---------------------------------------------------------------------------
 * This extracts *images and headings only*. It does not, and must not, read prices,
 * levels, bias or any other number out of the document.
 *
 * An earlier build parsed the text layer for levels and produced runs like
 * `DXY 101.977100.365100.020` — three separate levels welded into one number. On a
 * research product a wrong level is worse than a missing one, so every figure a member
 * reads comes from either the rendered PDF page itself or an admin-authored instrument
 * row. Nothing here derives one.
 *
 * Headings are the one exception, and deliberately so: the worst case for a misread
 * heading is a chart filed under the wrong instrument, which is visible at a glance and
 * harmless. Anything unrecognised is kept, never dropped.
 * ---------------------------------------------------------------------------
 */

export type ChartImage = {
  /** Object URL for a PNG. Revoke with `releaseSections` when the view unmounts. */
  url: string
  width: number
  height: number
  page: number
}

export type PdfSection = {
  /** Match key against admin-authored instruments — uppercase, alphanumeric. */
  key: string
  /** Heading as printed in the document. */
  title: string
  pages: number[]
  charts: ChartImage[]
}

export type ExtractionResult = {
  sections: PdfSection[]
  /** Charts on pages with no identifiable heading. Shown, never discarded. */
  loose: ChartImage[]
  /** Total pages, so the caller can say how much of the document was covered. */
  pageCount: number
}

/** Below this, an image is a rule, an icon or a bullet — not a chart. */
const MIN_CHART_PX = 300

/** Distinct quantised colours below which an image is decoration. See the use site. */
const MIN_CHART_COLOURS = 16

/**
 * Charts plot a series against time, and time runs across the page — every chart in a
 * research report is landscape. A square image at this size is a mark or a portrait.
 * Getting this wrong costs one image missing from the chart strip, while the full
 * document below still shows it, so the assumption is a cheap one to make.
 */
const MIN_CHART_ASPECT = 1.3

/**
 * An image appearing on more than this share of pages is page furniture — a logo or a
 * letterhead — not content. This is the general rule; it is what excludes the NordStar
 * mark that sits on all 22 pages without hard-coding anything about it.
 */
const FURNITURE_PAGE_SHARE = 0.5

export async function extractSections(doc: PdfDocument): Promise<ExtractionResult> {
  const pageCount = doc.numPages
  const paintOp = await paintImageOp()

  // Headings first, so a masthead can be told from an instrument. On the cover the
  // brand is set large and would otherwise read as the page's heading; the same
  // furniture rule that identifies a repeated logo identifies it — text appearing on
  // most pages of a document is the document's furniture, not one page's subject.
  const headings: ({ key: string; title: string } | null)[] = []
  const titleCounts = new Map<string, number>()

  for (let n = 1; n <= pageCount; n += 1) {
    const heading = await readHeading(await doc.getPage(n))
    headings.push(heading)
    if (heading) titleCounts.set(heading.key, (titleCounts.get(heading.key) ?? 0) + 1)
  }

  const repeatLimit = Math.max(2, Math.ceil(pageCount * FURNITURE_PAGE_SHARE))

  const sections: PdfSection[] = []
  const loose: ChartImage[] = []
  const byKey = new Map<string, PdfSection>()
  let current: PdfSection | null = null

  const scratch = document.createElement('canvas')
  const decoded: { chart: ChartImage; signature: string; section: PdfSection | null }[] = []
  const signaturePages = new Map<string, Set<number>>()

  for (let n = 1; n <= pageCount; n += 1) {
    const page = await doc.getPage(n)
    const candidate = headings[n - 1]
    const heading = candidate && (titleCounts.get(candidate.key) ?? 0) < repeatLimit ? candidate : null
    const names = await imageNames(page, paintOp)

    if (heading) {
      // Consecutive pages under the same instrument merge — a report typically gives an
      // instrument a summary page and a context page, and they are one section to read.
      const existing = byKey.get(heading.key)
      if (existing) {
        current = existing
        if (!existing.pages.includes(n)) existing.pages.push(n)
      } else {
        current = { key: heading.key, title: heading.title, pages: [n], charts: [] }
        byKey.set(heading.key, current)
        sections.push(current)
      }
    }

    if (names.length === 0) continue

    await renderForDecode(page, scratch)

    for (const name of names) {
      const image = await resolveImageObject(page, doc, name)
      if (!image || image.width < MIN_CHART_PX || image.height < MIN_CHART_PX / 3) continue
      if (image.width / image.height < MIN_CHART_ASPECT) continue

      const result = await toChartImage(image, n)
      if (!result) continue

      // A near-flat image is a rule, a gradient band or a block of colour — decoration,
      // not analysis. Measured against this product's own reports, chart captures score
      // 36–74 distinct colours and decorative fills score 4; the threshold sits well
      // clear of both.
      if (result.variety < MIN_CHART_COLOURS) {
        URL.revokeObjectURL(result.chart.url)
        continue
      }

      decoded.push({ chart: result.chart, signature: result.signature, section: current })
      const pages = signaturePages.get(result.signature) ?? new Set<number>()
      pages.add(n)
      signaturePages.set(result.signature, pages)
    }
  }

  // Furniture is identified by content, not by name: pdf.js only promotes an image to a
  // document-wide object once it has seen it reused, so a logo keeps a page-local name on
  // its first appearance and a name-based filter misses exactly one copy of it — the one
  // on the cover. Decoded dimensions plus compressed byte length identify it everywhere.
  for (const entry of decoded) {
    if ((signaturePages.get(entry.signature)?.size ?? 0) >= repeatLimit) {
      URL.revokeObjectURL(entry.chart.url)
      continue
    }
    if (entry.section) entry.section.charts.push(entry.chart)
    else loose.push(entry.chart)
  }

  // A section that produced no charts is a heading we recognised but had nothing to show
  // for — drop it rather than render an empty band.
  return { sections: sections.filter((s) => s.charts.length > 0), loose, pageCount }
}

/** Revoke every object URL a previous extraction created. */
export function releaseSections(result: ExtractionResult | null) {
  if (!result) return
  for (const section of result.sections) {
    for (const chart of section.charts) URL.revokeObjectURL(chart.url)
  }
  for (const chart of result.loose) URL.revokeObjectURL(chart.url)
}

async function imageNames(page: PdfPage, paintOp: number): Promise<string[]> {
  const ops = await page.getOperatorList()
  const names: string[] = []

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    if (ops.fnArray[i] !== paintOp) continue
    const name = ops.argsArray[i]?.[0]
    if (typeof name === 'string') names.push(name)
  }
  return names
}

/**
 * Render at a deliberately small scale. The point is not the picture — it is that
 * pdf.js only decodes image XObjects during a render pass, and the decoded images come
 * back at their own full resolution regardless of the scale used here. So this is as
 * cheap as it is allowed to be.
 */
async function renderForDecode(page: PdfPage, canvas: HTMLCanvasElement) {
  const viewport = page.getViewport({ scale: 0.35 })
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))

  const context = canvas.getContext('2d')
  if (!context) return

  try {
    await page.render({ canvasContext: context, viewport }).promise
  } catch {
    // A page that will not render still may have yielded some objects; carry on.
  }
}

/**
 * The instrument heading on a page.
 *
 * Found by type size rather than by position or a pattern: the largest text in the top
 * fifth of a page is its heading in any competently set document, which is a far safer
 * assumption than a regex over ticker shapes. `DXY — Macro Context` and `DXY` are the
 * same instrument, so anything after a dash is trimmed for the match while the printed
 * heading is kept for display.
 */
async function readHeading(page: PdfPage): Promise<{ key: string; title: string } | null> {
  const [content, viewport] = await Promise.all([
    page.getTextContent(),
    Promise.resolve(page.getViewport({ scale: 1 })),
  ])

  const cutoff = viewport.height * 0.8
  const candidates = content.items.filter(
    (item: PdfTextItem) => item.str.trim().length > 0 && (item.transform?.[5] ?? 0) >= cutoff,
  )
  if (candidates.length === 0) return null

  const largest = candidates.reduce((best, item) => (item.height > best.height ? item : best))
  // Running heads (a masthead, a date) repeat at a small size; a heading is set larger.
  if (largest.height < 12) return null

  const title = largest.str.trim()
  const key = normaliseKey(title)
  if (!key) return null

  return { key, title }
}

export function normaliseKey(value: string): string {
  return (
    value
      // Everything up to the first dash — em, en or hyphen — is the instrument.
      .split(/[—–-]/)[0]
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16)
  )
}

/**
 * Convert a decoded pdf.js image into a PNG object URL.
 *
 * The canvas is painted white first. Chart captures are frequently exported with a
 * transparent background, and a transparent chart dropped onto a black band renders as
 * an unreadable smear of dark grid lines — so every chart gets real white paper under
 * it, which is also how they were authored.
 */
async function toChartImage(
  image: PdfImage,
  page: number,
): Promise<{ chart: ChartImage; signature: string; variety: number } | null> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height

  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (image.bitmap) {
    context.drawImage(image.bitmap, 0, 0)
  } else if (image.data) {
    const rgba = toRgba(image)
    if (!rgba) return null

    // Composited onto the white fill rather than replacing it, so alpha is honoured.
    const layer = document.createElement('canvas')
    layer.width = image.width
    layer.height = image.height
    const layerContext = layer.getContext('2d')
    if (!layerContext) return null

    const imageData = layerContext.createImageData(image.width, image.height)
    imageData.data.set(rgba)
    layerContext.putImageData(imageData, 0, 0)
    context.drawImage(layer, 0, 0)
  } else {
    return null
  }

  const variety = colourVariety(canvas)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return null

  return {
    chart: { url: URL.createObjectURL(blob), width: image.width, height: image.height, page },
    // Dimensions plus compressed length. Two different charts sharing both is not a case
    // worth engineering around; the same logo re-embedded on the cover is.
    signature: `${image.width}x${image.height}:${blob.size}`,
    variety,
  }
}

/**
 * How many distinct colours an image contains, sampled at 32×32 and quantised to 4 bits
 * per channel. Cheap, and enough to tell a chart from a block of colour: a candle chart
 * carries a background, gridlines, axis text and two candle colours at minimum, while a
 * decorative band carries a handful of steps of one hue.
 */
function colourVariety(source: HTMLCanvasElement): number {
  const sample = document.createElement('canvas')
  sample.width = 32
  sample.height = 32

  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return Number.MAX_SAFE_INTEGER

  context.drawImage(source, 0, 0, 32, 32)
  const { data } = context.getImageData(0, 0, 32, 32)

  const seen = new Set<number>()
  for (let i = 0; i < data.length; i += 4) {
    seen.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4))
  }
  return seen.size
}

/** pdf.js hands back one of three pixel layouts; normalise them to RGBA. */
function toRgba(image: PdfImage): Uint8ClampedArray | null {
  const { width, height, data, kind } = image
  if (!data) return null

  const out = new Uint8ClampedArray(width * height * 4)

  if (kind === 3) {
    if (data.length < out.length) return null
    out.set(data.subarray(0, out.length))
    return out
  }

  if (kind === 2) {
    if (data.length < width * height * 3) return null
    for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
      out[i * 4] = data[j]
      out[i * 4 + 1] = data[j + 1]
      out[i * 4 + 2] = data[j + 2]
      out[i * 4 + 3] = 255
    }
    return out
  }

  if (kind === 1) {
    // 1 bit per pixel, rows padded to whole bytes. A set bit is white.
    const rowBytes = (width + 7) >> 3
    if (data.length < rowBytes * height) return null

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1
        const value = bit ? 255 : 0
        const i = (y * width + x) * 4
        out[i] = value
        out[i + 1] = value
        out[i + 2] = value
        out[i + 3] = 255
      }
    }
    return out
  }

  return null
}
