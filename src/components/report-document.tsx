'use client'

import * as React from 'react'
import { FileWarning, Loader2 } from 'lucide-react'

import { InstrumentSections, type InstrumentBandModel } from '@/components/instrument-sections'
import { PdfFlipReader } from '@/components/pdf-flip-reader'
import { loadReportDocument, type PdfDocument } from '@/lib/pdf-client'
import { extractSections, normaliseKey, releaseSections, type ExtractionResult } from '@/lib/pdf-sections'
import { watermarkTile } from '@/lib/watermark'
import type { ReportInstrument } from '@/lib/report-content'

/**
 * The report reading experience, built from the uploaded PDF.
 *
 * The contract this exists to keep: **a PDF is uploaded and the report is presentable
 * here, with no further authoring.** The document's own charts are lifted out and shown
 * under the instrument they belong to, each on white paper, in bands that alternate
 * black and white — and the whole document is still available page by page underneath.
 *
 * Everything is derived in the member's browser from the same signed, short-lived fetch
 * the page reader already makes. Nothing new is stored, so this works retroactively on
 * reports that were uploaded before it existed, and no admin has to re-do anything.
 *
 * What is *not* derived: prices, levels and bias. Those come only from admin-authored
 * instrument rows. See the note at the top of src/lib/pdf-sections.ts.
 */
export function ReportDocument({
  reportId,
  watermarkLabel,
  instruments,
}: {
  reportId: string
  watermarkLabel: string
  instruments: ReportInstrument[]
}) {
  const [doc, setDoc] = React.useState<PdfDocument | null>(null)
  const [extraction, setExtraction] = React.useState<ExtractionResult | null>(null)
  const [phase, setPhase] = React.useState<'loading' | 'charts' | 'ready' | 'error'>('loading')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let loaded: PdfDocument | null = null
    let extracted: ExtractionResult | null = null

    async function run() {
      try {
        setPhase('loading')
        loaded = await loadReportDocument(reportId)
        if (cancelled) return

        setDoc(loaded)
        setPhase('charts')

        extracted = await extractSections(loaded)
        if (cancelled) {
          releaseSections(extracted)
          return
        }

        setExtraction(extracted)
        setPhase('ready')
      } catch (err) {
        if (cancelled) return
        console.error('[report-document]', err)
        setError(err instanceof Error ? err.message : 'Could not open the document.')
        setPhase('error')
      }
    }

    void run()
    return () => {
      cancelled = true
      releaseSections(extracted)
      void loaded?.destroy?.()
    }
  }, [reportId])

  const watermarkStyle = React.useMemo(
    () => ({ '--watermark-image': watermarkTile(watermarkLabel, '#e9e7dd') }) as React.CSSProperties,
    [watermarkLabel],
  )
  const watermarkStyleLight = React.useMemo(
    () => ({ '--watermark-image': watermarkTile(watermarkLabel, '#000000') }) as React.CSSProperties,
    [watermarkLabel],
  )

  const bands = React.useMemo(
    () => buildBands(extraction, instruments),
    [extraction, instruments],
  )

  if (phase === 'error') {
    return (
      <div className="panel flex flex-col items-center px-6 py-14 text-center">
        <FileWarning className="mb-4 h-6 w-6 text-down" aria-hidden />
        <h2 className="font-display text-lg text-ink">This document could not be opened</h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-dim">{error}</p>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-dim">
          Reload the page to try again — view links expire after a few minutes.
        </p>
      </div>
    )
  }

  if (phase === 'loading' || phase === 'charts') {
    return (
      <div className="panel flex flex-col items-center px-6 py-16 text-center">
        <Loader2 className="mb-4 h-6 w-6 animate-spin text-accent" aria-hidden />
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
          {phase === 'loading' ? 'Opening the report' : 'Preparing the charts'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {/*
        The book leads. A member opening a report wants to read the edition, and the
        edition is a designed document — pages, charts, tables — so it is presented as
        one, with the numbers marked in the accent lime because the levels are what most
        readers came for.
      */}
      {doc && (
        <section className="mb-12" aria-label="The report">
          <PdfFlipReader doc={doc} watermarkLabel={watermarkLabel} />
        </section>
      )}

      {/*
        Then the charts on their own, pulled out of those same pages and grouped by
        instrument. Reading a chart inside a full page on a phone is not really reading
        it; here each one gets the full width of the screen and opens larger still.
      */}
      {bands.length > 0 && (
        <section>
          <h2 className="eyebrow mb-4">Charts by instrument</h2>
          <InstrumentSections
            bands={bands}
            watermarkStyle={watermarkStyle}
            watermarkStyleLight={watermarkStyleLight}
          />
        </section>
      )}
    </div>
  )
}

/**
 * Merge what the document yielded with what an admin wrote.
 *
 * Document order wins, because that is the order the analyst chose to present the week
 * in. Authored instruments that the document has no section for are appended rather than
 * dropped — as are charts from pages with no identifiable heading, which land in a final
 * band instead of disappearing. Nothing extracted is ever silently discarded; a chart in
 * the wrong place is recoverable, a missing one is invisible.
 */
export function buildBands(
  extraction: ExtractionResult | null,
  instruments: ReportInstrument[],
): InstrumentBandModel[] {
  const authored = new Map<string, ReportInstrument>()
  for (const instrument of instruments) {
    const key = normaliseKey(instrument.symbol)
    if (key) authored.set(key, instrument)
  }

  const bands: InstrumentBandModel[] = []
  const used = new Set<string>()

  for (const section of extraction?.sections ?? []) {
    used.add(section.key)
    bands.push({
      key: section.key,
      title: section.title,
      charts: section.charts,
      instrument: authored.get(section.key),
      pages: section.pages,
    })
  }

  for (const [key, instrument] of authored) {
    if (used.has(key)) continue
    bands.push({ key, title: instrument.symbol, charts: [], instrument, pages: [] })
  }

  if (extraction && extraction.loose.length > 0) {
    bands.push({
      key: 'CHARTS',
      title: 'Further charts',
      charts: extraction.loose,
      pages: [extraction.loose[0].page],
    })
  }

  return bands
}
