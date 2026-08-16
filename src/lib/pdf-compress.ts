'use client'

/**
 * Shrink a report PDF in the browser, before it is uploaded.
 *
 * ## Why this exists
 *
 * A NordStar report is almost entirely chart images. In a measured example, 33 JPEGs at
 * roughly 2,400px wide accounted for 14.1 MB of a 14.2 MB file — the text, vectors and
 * everything else came to about 100 KB. Those charts are exported far larger than any
 * screen displays them, so most of that weight is never seen by anybody.
 *
 * It matters because storage and egress are billed. Storage accrues forever (nothing is
 * ever deleted) and egress scales with members × reports read, not with reports
 * published, so the download size is multiplied by every reader.
 *
 * ## What it does, and what it deliberately does not
 *
 * It re-encodes **image XObjects only**. The page tree, the text layer, fonts, vectors and
 * annotations are untouched, and the file stays the same PDF with the same pages.
 *
 * Keeping the text layer intact is not a nicety — the reader marks the neon-green numbers
 * from it, so a "compressor" that rasterised pages to images would silently destroy the
 * feature this product is built around. That approach is common and is the wrong one here.
 *
 * ## The settings, and how they were chosen
 *
 * 1,400px and quality 0.78 were picked by comparing the original against downsampled
 * versions at 3× magnification on the densest text in the document — the price axis of a
 * TradingView chart. At that magnification the original, 1,400px and 1,200px renderings
 * were indistinguishable and every price level stayed legible. 1,400px was taken over the
 * smaller option to leave headroom, since zoom and fullscreen are things members do.
 *
 * ## The rules it follows
 *
 * - **Only JPEG (DCTDecode) images.** Anything else — flate-encoded bitmaps, stencil
 *   masks, images behind multiple filters — is left exactly as it was. There is no
 *   half-understood transcoding here.
 * - **Only if it actually helps.** A re-encoded image is kept only when it is meaningfully
 *   smaller; otherwise the original bytes stay. The same test is applied to the whole file
 *   at the end, so a PDF that resists compression is uploaded untouched.
 * - **Never throws away the original.** Every failure path — a decode error, an
 *   unsupported colour space, an out-of-memory canvas — falls back to the file as given.
 *   An upload must not fail because an optimisation did.
 */

export const MAX_IMAGE_WIDTH = 1400
export const JPEG_QUALITY = 0.78

/** Below this, re-encoding costs more in artefacts than it saves in bytes. */
const MIN_IMAGE_BYTES = 250 * 1024

/** A replacement has to beat the original by this much to be worth the quality loss. */
const MIN_IMAGE_GAIN = 0.1
const MIN_FILE_GAIN = 0.05

export type CompressionResult = {
  file: File
  originalBytes: number
  compressedBytes: number
  /** How many image streams were actually replaced. */
  imagesRebuilt: number
  /** True when the original was returned unchanged. */
  skipped: boolean
  /** Why it was skipped, for the operator rather than the log. */
  reason?: string
}

export type CompressionProgress = (done: number, total: number) => void

export async function compressReportPdf(
  file: File,
  onProgress?: CompressionProgress,
): Promise<CompressionResult> {
  const originalBytes = file.size
  const unchanged = (reason: string): CompressionResult => ({
    file,
    originalBytes,
    compressedBytes: originalBytes,
    imagesRebuilt: 0,
    skipped: true,
    reason,
  })

  if (typeof createImageBitmap !== 'function') {
    return unchanged('This browser cannot decode images off-screen.')
  }

  try {
    // Loaded on demand so pdf-lib is not in the bundle for admins who never upload.
    const { PDFDocument, PDFName, PDFNumber, PDFRawStream } = await import('pdf-lib')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = await PDFDocument.load(bytes, {
      // The file is a finished artefact from a designer, not something to normalise.
      updateMetadata: false,
      ignoreEncryption: false,
    })

    const context = doc.context
    // Derived from the factory rather than `InstanceType`: pdf-lib gives PDFRawStream a
    // private constructor, so the class type is not directly instantiable in a signature.
    type RawStream = ReturnType<typeof PDFRawStream.of>
    const candidates: { ref: unknown; stream: RawStream }[] = []

    for (const [ref, object] of context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue

      const dict = object.dict
      if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
      // A stencil mask is 1 bit per pixel and is not a photograph; re-encoding one as
      // JPEG would corrupt the page rather than shrink it.
      if (dict.get(PDFName.of('ImageMask'))) continue
      // Only a lone DCTDecode filter. An array means the bytes are not plain JPEG.
      if (dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue

      candidates.push({ ref, stream: object })
    }

    if (candidates.length === 0) {
      return unchanged('No JPEG images to resample — the size is not coming from images.')
    }

    let rebuilt = 0
    let done = 0
    onProgress?.(0, candidates.length)

    for (const { ref, stream } of candidates) {
      const replacement = await rebuildImage(stream.getContents())

      if (replacement) {
        const dict = stream.dict
        dict.set(PDFName.of('Width'), PDFNumber.of(replacement.width))
        dict.set(PDFName.of('Height'), PDFNumber.of(replacement.height))
        dict.set(PDFName.of('Length'), PDFNumber.of(replacement.bytes.length))
        // A canvas always produces 8-bit RGB, whatever the source colour space was.
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
        dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
        // Both describe the *old* sample data and would misread the new bytes.
        dict.delete(PDFName.of('DecodeParms'))
        dict.delete(PDFName.of('Decode'))

        context.assign(ref as never, PDFRawStream.of(dict, replacement.bytes))
        rebuilt += 1
      }

      done += 1
      onProgress?.(done, candidates.length)
    }

    if (rebuilt === 0) {
      return unchanged('The images are already at a sensible size.')
    }

    // `useObjectStreams` keeps the rewritten file compact without touching page content.
    const output = await doc.save({ useObjectStreams: true })
    const compressedBytes = output.byteLength

    if (compressedBytes > originalBytes * (1 - MIN_FILE_GAIN)) {
      return unchanged('Compressing it would not have saved anything worth the quality.')
    }

    return {
      file: new File([output as BlobPart], file.name, { type: 'application/pdf' }),
      originalBytes,
      compressedBytes,
      imagesRebuilt: rebuilt,
      skipped: false,
    }
  } catch {
    // Encrypted, malformed, or simply too large for this device's memory. The upload
    // proceeds with the original file, which is always the safe outcome.
    return unchanged('This PDF could not be compressed, so it will upload as it is.')
  }
}

/**
 * Decode one JPEG, downsample it, and re-encode.
 *
 * Returns null whenever the result is not clearly better than the original — including
 * when the image was already small enough to leave alone.
 */
async function rebuildImage(
  original: Uint8Array,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  // Copied into a fresh buffer: the view points into pdf-lib's own memory, and Blob would
  // otherwise capture far more of it than these few bytes.
  const source = new Uint8Array(original)
  if (source.byteLength < MIN_IMAGE_BYTES) return null

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([source as BlobPart], { type: 'image/jpeg' }))
  } catch {
    // CMYK and other exotic JPEGs are refused by some browsers. Leave them alone.
    return null
  }

  try {
    const scale = bitmap.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / bitmap.width : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const encoded = await drawAndEncode(bitmap, width, height)
    if (!encoded) return null

    if (encoded.length > source.byteLength * (1 - MIN_IMAGE_GAIN)) return null
    return { bytes: encoded, width, height }
  } finally {
    bitmap.close()
  }
}

async function drawAndEncode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Uint8Array | null> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    return new Uint8Array(await blob.arrayBuffer())
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}
