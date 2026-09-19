'use client'

/**
 * Browser-side loading of a report PDF.
 *
 * One place, because the report page needs the same document twice — once to pull the
 * charts out of it, once to page through it — and fetching 3–4MB twice on a phone is not
 * acceptable.
 *
 * The access model is unchanged: bytes arrive through a short-lived signed URL bound to
 * one member and one report, fetched into memory. Nothing is written to disk and no
 * shareable link is ever produced.
 */

export type PdfDocument = {
  numPages: number
  getPage: (n: number) => Promise<PdfPage>
  commonObjs: PdfObjs
  destroy: () => Promise<void>
}

export type PdfPage = {
  getViewport: (o: { scale: number }) => {
    width: number
    height: number
    /** Affine matrix mapping PDF user space to canvas space, for the text layer. */
    transform: number[]
    scale: number
  }
  render: (o: unknown) => { promise: Promise<void>; cancel: () => void }
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  getTextContent: () => Promise<{ items: PdfTextItem[] }>
  objs: PdfObjs
}

export type PdfTextItem = {
  str: string
  height: number
  width: number
  transform: number[]
}

export type PdfObjs = {
  has: (name: string) => boolean
  get: (name: string, callback?: (value: unknown) => void) => unknown
}

/**
 * The pdf.js op code for "paint an image XObject", read from the library rather than
 * hard-coded. Async because it is only knowable once pdf.js has loaded, and callers must
 * not depend on some earlier call having happened to load it first.
 */
export async function paintImageOp(): Promise<number> {
  return (await pdfjs()).OPS.paintImageXObject
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      // Served from our own origin, copied into /public at build time by
      // scripts/copy-pdf-worker.mjs. Never a CDN: paid research must not fail to render
      // because a third-party host is slow or blocked.
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      return lib
    })
  }
  return pdfjsPromise
}

/**
 * The first five bytes of every PDF ever written: `%PDF-`.
 *
 * Checked because the alternative is pdf.js being handed something that is not a PDF at
 * all and reporting "Invalid PDF structure" — which reads as "your file is corrupt" and
 * is usually not what happened. See below.
 */
function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //   -
  )
}

export async function loadReportDocument(reportId: string): Promise<PdfDocument> {
  const response = await fetch(`/api/reports/${reportId}/view-url`, { method: 'POST' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Could not open the document.')

  const lib = await pdfjs()

  /*
   * The download is checked before it is parsed.
   *
   * This used to be `await (await fetch(url)).arrayBuffer()` with no look at the status.
   * A signed view link that has expired, or a blob that has moved, answers with an XML
   * error document — and `arrayBuffer()` returns those bytes perfectly happily. pdf.js
   * then parses `<?xml ...` and throws "Invalid PDF structure", so a member is told the
   * research they paid for is corrupt when the actual fault was a download that failed.
   *
   * Three separate things can go wrong and they need three different answers, because
   * only one of them is fixed by reloading and only one needs the file re-uploading.
   */
  const file = await fetch(data.url)
  if (!file.ok) {
    /*
     * The file route answers a refusal with JSON that already says why — "This link has
     * expired. Open the report again." — so the member is told that rather than a status
     * code. The code is kept as the fallback for a failure with no body to read.
     */
    const reason = await file
      .clone()
      .json()
      .then((body) => (typeof body?.error === 'string' ? body.error : null))
      .catch(() => null)
    throw new Error(
      reason ??
        `The document could not be downloaded (HTTP ${file.status}). View links expire after a ` +
          `few minutes — reload the page to get a fresh one.`,
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length === 0) {
    throw new Error('The stored document is empty. It needs uploading again.')
  }
  if (!looksLikePdf(bytes)) {
    throw new Error(
      'What came back is not a PDF. Reload the page first — if it keeps happening, the ' +
        'uploaded file is not a PDF and needs replacing.',
    )
  }

  const doc = await lib.getDocument({ data: bytes }).promise
  return doc as unknown as PdfDocument
}

/**
 * Wait for a pdf.js image object to resolve.
 *
 * pdf.js only decodes image XObjects while a page is being rendered, so this must not be
 * called before `page.render()` has run for that page — the synchronous form throws
 * "Requesting object that isn't resolved yet". The callback form waits instead.
 *
 * Names prefixed `g_` live on the document-wide store rather than the page's: pdf.js
 * promotes an image shared by several pages (a logo, a letterhead) to a global object.
 */
export function resolveImageObject(
  page: PdfPage,
  doc: PdfDocument,
  name: string,
  timeoutMs = 15_000,
): Promise<PdfImage | null> {
  const store = name.startsWith('g_') ? doc.commonObjs : page.objs

  return new Promise((resolve) => {
    let settled = false
    const done = (value: PdfImage | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    // A document that never resolves an object must not hang the whole reading view.
    const timer = window.setTimeout(() => done(null), timeoutMs)

    try {
      store.get(name, (value) => {
        window.clearTimeout(timer)
        done((value as PdfImage) ?? null)
      })
    } catch {
      window.clearTimeout(timer)
      done(null)
    }
  })
}

export type PdfImage = {
  width: number
  height: number
  /** 1 = grayscale 1bpp, 2 = RGB 24bpp, 3 = RGBA 32bpp. Absent when `bitmap` is set. */
  kind?: number
  data?: Uint8Array | Uint8ClampedArray
  bitmap?: CanvasImageSource
}
