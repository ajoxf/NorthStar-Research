import 'server-only'

import { escapeHtml } from '@/lib/notifications/templates'

/**
 * Build a responsive HTML rendering from an uploaded PDF.
 *
 * Requirement 12 rules out "a raw PDF is the only format" — a PDF page does not reflow
 * on a phone and cannot be shown inside an email. So on upload we extract the text layer
 * and store it as semantic HTML, which the reader and the (link-only) email view can both
 * lay out responsively. The original PDF is kept untouched in Blob storage for download.
 *
 * Two honest limitations, both surfaced to the admin at upload time rather than hidden:
 *   - charts and images in the PDF are not carried across; the text layer is;
 *   - a scanned/image-only PDF has no text layer at all, so nothing is extracted (we do
 *     not OCR). For those, the admin should paste the reading view content by hand.
 * The admin can always edit or replace the generated HTML before publishing.
 */
export async function extractPdfHtml(
  buffer: ArrayBuffer,
): Promise<{ html: string | null; pages: number; warning: string | null }> {
  try {
    // Imported lazily and from the legacy build: the default entry point expects browser
    // globals that do not exist in a serverless function.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // No worker thread and no system fonts in a serverless runtime.
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise

    const paragraphs: string[] = []

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()

      // Rebuild lines from the positioned text items, then group consecutive lines into
      // paragraphs on blank-line boundaries. Crude, but it turns a wall of spans into
      // something that reflows sensibly.
      let line = ''
      const lines: string[] = []

      for (const item of content.items) {
        if (!('str' in item)) continue
        line += item.str
        if (item.hasEOL) {
          lines.push(line.trim())
          line = ''
        }
      }
      if (line.trim()) lines.push(line.trim())

      let paragraph: string[] = []
      for (const entry of lines) {
        if (entry === '') {
          if (paragraph.length) paragraphs.push(paragraph.join(' '))
          paragraph = []
        } else {
          paragraph.push(entry)
        }
      }
      if (paragraph.length) paragraphs.push(paragraph.join(' '))
    }

    const cleaned = paragraphs.map((text) => text.trim()).filter((text) => text.length > 1)

    if (cleaned.length === 0) {
      return {
        html: null,
        pages: doc.numPages,
        warning:
          'No text layer was found in this PDF (it may be a scan or an image export). The reading ' +
          'view will be empty until you add content — members will only be able to download the PDF.',
      }
    }

    const html = cleaned
      .map((text) => {
        // Short, title-cased lines read as headings far more often than not.
        const isHeading = text.length < 70 && !text.endsWith('.') && /^[A-Z0-9]/.test(text)
        return isHeading ? `<h2>${escapeHtml(text)}</h2>` : `<p>${escapeHtml(text)}</p>`
      })
      .join('\n')

    return { html, pages: doc.numPages, warning: null }
  } catch (error) {
    console.error('[pdf] text extraction failed', error)
    return {
      html: null,
      pages: 0,
      warning:
        'We could not read the text out of this PDF, so no reading view was generated. The PDF ' +
        'itself uploaded fine — you can paste the reading view content in manually.',
    }
  }
}

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
