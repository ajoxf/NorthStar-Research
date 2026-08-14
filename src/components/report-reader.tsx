'use client'

import * as React from 'react'
import { Download, FileText, ShieldAlert } from 'lucide-react'

import { InstrumentSections } from '@/components/instrument-sections'
import { PdfFlipReader } from '@/components/pdf-flip-reader'
import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { watermarkTile } from '@/lib/watermark'
import type { ReportInstrument } from '@/lib/report-content'

/**
 * In-app reading view.
 *
 * Order matters here. Every edition is authored as a PDF, and the charts in it *are* the
 * research — so the PDF pages are rendered first, page by page, exactly as drawn. An
 * earlier build tried to re-typeset the document from its text layer; it dropped every
 * chart and mangled price tables, which is why nothing on this page derives report
 * content from the file automatically (see src/lib/pdf.ts).
 *
 * The instrument bands and any hand-written reading view sit *below* the document. They
 * are a structured index over it — quick levels on a phone — not a replacement for it.
 *
 * The original PDF is still offered as an explicit, logged download.
 */
export function ReportReader({
  reportId,
  watermarkLabel,
  instruments,
  htmlContent,
  hasPdf,
}: {
  reportId: string
  watermarkLabel: string
  instruments: ReportInstrument[]
  htmlContent: string | null
  hasPdf: boolean
}) {
  const toast = useToast()
  const [downloading, setDownloading] = React.useState(false)

  const watermarkStyle = React.useMemo(
    () => ({ '--watermark-image': watermarkTile(watermarkLabel, '#e9e7dd') }) as React.CSSProperties,
    [watermarkLabel],
  )
  const watermarkStyleLight = React.useMemo(
    () => ({ '--watermark-image': watermarkTile(watermarkLabel, '#000000') }) as React.CSSProperties,
    [watermarkLabel],
  )

  async function handleDownload() {
    setDownloading(true)
    try {
      // The signed URL is minted per click and expires in minutes, so even the download
      // link cannot be usefully passed on.
      const response = await fetch(`/api/reports/${reportId}/download`, { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        toast(data.error ?? 'Download could not be prepared.', 'error')
        return
      }

      toast('Preparing your watermarked copy…', 'info')
      window.location.href = data.url
    } catch {
      toast('Download could not be prepared.', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const hasSupplement = instruments.length > 0 || Boolean(htmlContent)

  return (
    <div>
      {hasPdf && (
        <section className="mb-10" aria-label="Report document">
          <PdfFlipReader reportId={reportId} watermarkLabel={watermarkLabel} />
        </section>
      )}

      {instruments.length > 0 && (
        <section className="mb-10">
          <h2 className="eyebrow mb-4">Instrument levels</h2>
          <InstrumentSections
            instruments={instruments}
            watermarkStyle={watermarkStyle}
            watermarkStyleLight={watermarkStyleLight}
          />
        </section>
      )}

      {htmlContent && (
        <section
          className="watermarked panel px-5 py-8 sm:px-9 sm:py-10"
          style={watermarkStyle}
        >
          <div
            className="report-prose"
            // Author-supplied report body. Sanitised server-side before it is stored;
            // only admins can ever write it.
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </section>
      )}

      {!hasPdf && !hasSupplement && (
        <div className="panel flex flex-col items-center px-6 py-14 text-center">
          <FileText className="mb-4 h-6 w-6 text-ink-dim" aria-hidden />
          <h2 className="font-display text-lg text-ink">This edition is not ready yet</h2>
          <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-ink-dim">
            No document has been attached to this report. It will appear here as soon as the desk
            publishes it.
          </p>
        </div>
      )}

      {hasPdf && (
        <div className="mt-8 flex flex-col gap-4 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <p className="max-w-md text-[13px] leading-relaxed text-ink-dim">
              Downloads are watermarked with your account and recorded. Your access is personal —
              please do not share this file.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full sm:w-auto"
          >
            {downloading ? (
              <>
                <Spinner />
                Preparing…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden />
                Download for offline reading
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
