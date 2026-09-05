/**
 * Shared constants and validation for author photograph uploads.
 *
 * The browser uploads straight to Vercel Blob and then tells this app where it landed —
 * the same path report PDFs take, and for the same reason: a serverless function refuses
 * a request body over ~4.5 MB before any handler runs, so a genuinely high-resolution
 * portrait sent through a route would be rejected at the edge with a response the app
 * never sees. Uploading direct has no such ceiling.
 *
 * That does mean the URL arrives as *input* rather than as something the server produced,
 * so it is validated before being written to an author row.
 */

/**
 * The ceiling for one photograph.
 *
 * Generous, because the request was specifically for high resolution: a 6000px portrait
 * out of a camera is a few megabytes, and a limit that quietly rejected it would make
 * this feature not do the thing it was built for. Blob itself allows far more.
 */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024

export const AUTHOR_BLOB_PREFIX = 'authors/'

/**
 * What may be uploaded.
 *
 * **SVG is deliberately absent.** These render in an `<img>` on a public page, and an SVG
 * is a document that can carry script. Every other format here is inert pixels. An admin
 * uploading a malicious SVG would be attacking their own visitors, which is unlikely —
 * but "unlikely" is not a reason to accept an executable format when three inert ones
 * cover the actual need.
 *
 * AVIF and HEIC are absent for a duller reason: Safari and Chrome disagree about
 * rendering them in an `<img>`, and a photograph that shows for some visitors and not
 * others is worse than one the operator had to convert first.
 */
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Vercel Blob's public hostname. Every store lives on a subdomain of it. */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

/**
 * Is this a URL we just uploaded an author photograph to?
 *
 * Host is a Vercel Blob store and the path is inside the authors area. It cannot verify
 * the blob belongs to *this* store — the store id is not known to the app — so this is a
 * sanity check rather than an authorisation one. The authorisation is that only an admin
 * can mint an upload token at all.
 */
export function isAuthorPhotoUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (!url.hostname.endsWith(BLOB_HOST_SUFFIX)) return false
  return url.pathname.replace(/^\//, '').startsWith(AUTHOR_BLOB_PREFIX)
}

/** Human-readable size, for the error an operator actually reads. */
export function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Why this file cannot be uploaded, or null when it can.
 *
 * Checked in the browser before the upload starts, so somebody who picked a 40 MB TIFF is
 * told immediately rather than after waiting for it to transfer and fail.
 */
export function photoRejectionReason(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return 'Photographs must be a JPEG, PNG or WebP.'
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `That file is ${describeBytes(file.size)}. The limit is ${describeBytes(MAX_PHOTO_BYTES)}.`
  }
  if (file.size === 0) return 'That file is empty.'
  return null
}
