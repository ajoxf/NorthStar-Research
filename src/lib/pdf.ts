/**
 * Report HTML handling.
 *
 * ---------------------------------------------------------------------------
 * AUTOMATIC PDF TEXT EXTRACTION HAS BEEN REMOVED — DO NOT REINSTATE IT
 * ---------------------------------------------------------------------------
 * This module used to run uploaded PDFs through pdfjs and store whatever text came
 * back as the member-facing reading view. That was withdrawn deliberately, for two
 * reasons found in production:
 *
 *   1. It did not work on the real reports. pdfjs returned nothing at all for a
 *      22-page themed PDF that other extractors read fine — so the reading view came
 *      out empty and the operator had to write it by hand anyway.
 *
 *   2. When it *did* return text, the text was wrong in a way that matters here.
 *      Tables flattened into runs like `DXY 101.977100.365100.020` and body copy was
 *      concatenated into price cells (`7,238Q2 earnings are tracking…`). This is a
 *      trading research product: the price levels ARE the product. A garbled level is
 *      worse than a missing one, because it still looks like data and a member may
 *      act on it.
 *
 * Reading views are therefore hand-authored. The admin writes them in the "Reading
 * view content" field, and the report page warns whenever a PDF exists without one.
 * Reinstating extraction means first solving table-structure reconstruction — a naive
 * text dump is not a smaller version of that, it is a different and dangerous thing.
 * ---------------------------------------------------------------------------
 */

/**
 * Allow-list sanitiser for admin-authored report HTML.
 *
 * Only admins can reach this, so it guards against a mistake (a pasted `<script>` from a
 * Word export) rather than a hostile author — but report bodies are rendered with
 * dangerouslySetInnerHTML into every member's browser, so it is not optional.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'span',
])

export function sanitiseReportHtml(input: string): string {
  return (
    input
      // Drop whole dangerous elements including their content.
      .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/?(script|style|iframe|object|embed|form)\b[^>]*>/gi, '')
      // Strip inline event handlers and javascript: URLs.
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '')
      // Remove any tag not on the allow-list, keeping its inner text.
      .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) =>
        ALLOWED_TAGS.has(tag.toLowerCase()) ? match : '',
      )
      .trim()
  )
}
