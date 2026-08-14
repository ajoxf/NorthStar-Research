'use client'

import * as React from 'react'
import { Download, FileText, ShieldAlert } from 'lucide-react'

import { InstrumentTable } from '@/components/instrument-table'
import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { ReportInstrument } from '@/lib/report-content'

/**
 * In-app reading view.
 *
 * Deliberately not "an embedded PDF in a frame" (§6): the instrument tables and prose
 * are real, responsive DOM, so the report reads properly on a phone. The original PDF
 * remains available as an explicit, logged download for members who want it offline.
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

  /**
   * Repeating diagonal watermark carrying the viewing member's identity, applied as a
   * CSS background so it sits behind the text and survives a screenshot without
   * competing with the content (§7).
   */
  const watermarkStyle = React.useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200">
      <text x="0" y="100" transform="rotate(-24 0 100)" font-family="monospace" font-size="14" fill="%23e9e7dd">${escapeXml(
        watermarkLabel,
      )}</text>
    </svg>`
    return {
      '--watermark-image': `url("data:image/svg+xml;utf8,${svg.replace(/\n\s*/g, ' ').replace(/#/g, '%23')}")`,
    } as React.CSSProperties
  }, [watermarkLabel])

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

  return (
    <div>
      {instruments.length > 0 && (
        <section className="mb-10">
          <h2 className="eyebrow mb-3">Instrument levels</h2>
          <div className="watermarked" style={watermarkStyle}>
            <InstrumentTable instruments={instruments} />
          </div>
        </section>
      )}

      {htmlContent && (
        <section className="watermarked panel px-6 py-8 sm:px-9 sm:py-10" style={watermarkStyle}>
          <div
            className="report-prose"
            // Author-supplied report body. Sanitised server-side before it is stored;
            // only admins can ever write it.
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </section>
      )}

      {!htmlContent && instruments.length === 0 && (
        <div className="panel flex flex-col items-center px-6 py-14 text-center">
          <FileText className="mb-4 h-6 w-6 text-ink-dim" aria-hidden />
          <h2 className="font-display text-lg text-ink">This report is available as a PDF</h2>
          <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-ink-dim">
            A reading view has not been generated for this edition. Download the original below.
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

          <Button variant="secondary" onClick={handleDownload} disabled={downloading}>
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
