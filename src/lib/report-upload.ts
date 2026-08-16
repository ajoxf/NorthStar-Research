/**
 * Shared constants and validation for report PDF uploads.
 *
 * The browser uploads the PDF straight to Vercel Blob and then tells this app where it
 * landed. That is the only way a real research PDF can be uploaded at all — a serverless
 * function refuses a request body over ~4.5 MB before any handler runs — but it does mean
 * the storage URL arrives as *input* rather than as something the server produced itself.
 *
 * So it gets validated. Only an admin can reach the route that accepts it, and an admin
 * can already upload whatever they like, so this is not a privilege boundary; it is there
 * to stop a mistyped or stale URL being written into a report row, where it would fail
 * later at download time in front of a member instead of here in front of an operator.
 */

/**
 * The ceiling for a single report PDF.
 *
 * Vercel Blob itself allows far more; this is a sanity limit, not a platform one. It is
 * generous on purpose — the whole reason for the direct-upload path is that real reports
 * are tens of megabytes.
 */
export const MAX_PDF_BYTES = 100 * 1024 * 1024

export const REPORT_BLOB_PREFIX = 'reports/'

/** Vercel Blob's public hostname. Every store lives on a subdomain of it. */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

/**
 * Is this a URL we just uploaded a report to?
 *
 * Checks the host is a Vercel Blob store and the path is inside the reports area. It
 * cannot verify the blob belongs to *this* store — the store id is not known to the app
 * — which is why this is a sanity check and not an authorisation one.
 */
export function isReportBlobUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (!url.hostname.endsWith(BLOB_HOST_SUFFIX)) return false
  return url.pathname.replace(/^\//, '').startsWith(REPORT_BLOB_PREFIX)
}

/** Blob path component derived from the report title. A random suffix is added by Blob. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'report'
  )
}

/** Human-readable size, for error messages an operator has to act on. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
