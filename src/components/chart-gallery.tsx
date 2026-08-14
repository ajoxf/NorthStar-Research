'use client'

import * as React from 'react'
import { Expand, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ChartImage } from '@/lib/pdf-sections'

/**
 * The charts for one instrument.
 *
 * Always on white, on both the black and the white bands. Chart captures are authored on
 * white paper with dark gridlines and grey axis text; dropping one onto a black panel
 * makes it a smear, and tinting it makes the candle colours lie. So each chart gets real
 * paper under it and the band colour changes around it, not beneath it.
 *
 * The first chart on a page is the primary timeframe and is given the full width; the
 * rest sit in a two-up grid that collapses to one column on a phone. Every chart keeps
 * its own aspect ratio, so nothing is stretched — they line up on their top edges within
 * a row instead, which is what "aligned" means for images of differing height.
 */
export function ChartGallery({ charts, light }: { charts: ChartImage[]; light: boolean }) {
  const [zoomed, setZoomed] = React.useState<ChartImage | null>(null)

  React.useEffect(() => {
    if (!zoomed) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setZoomed(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  if (charts.length === 0) return null

  const [primary, ...rest] = charts

  return (
    <div className="px-4 py-5 sm:px-7 sm:py-6">
      <ChartFrame chart={primary} light={light} onZoom={setZoomed} priority />

      {rest.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rest.map((chart) => (
            <ChartFrame key={chart.url} chart={chart} light={light} onZoom={setZoomed} />
          ))}
        </div>
      )}

      {zoomed && <ChartLightbox chart={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  )
}

function ChartFrame({
  chart,
  light,
  onZoom,
  priority = false,
}: {
  chart: ChartImage
  light: boolean
  onZoom: (chart: ChartImage) => void
  priority?: boolean
}) {
  return (
    <figure
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-white',
        light ? 'border-black/15' : 'border-white/15',
      )}
    >
      <button
        type="button"
        onClick={() => onZoom(chart)}
        aria-label={`Enlarge chart from page ${chart.page}`}
        className="block w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL from an
            in-memory PDF; there is no remote source for next/image to optimise. */}
        <img
          src={chart.url}
          alt={`Chart from page ${chart.page} of the report`}
          width={chart.width}
          height={chart.height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="block h-auto w-full"
        />
      </button>

      {/* Charts are dense; on a phone the only way to read one is to open it. */}
      <span
        className="pointer-events-none absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-80 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <Expand className="h-3.5 w-3.5" />
      </span>
    </figure>
  )
}

function ChartLightbox({ chart, onClose }: { chart: ChartImage; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged chart"
      className="fixed inset-0 z-50 flex flex-col bg-black/92 p-3 sm:p-6"
      onClick={onClose}
    >
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-[13px] text-white"
        >
          <X className="h-4 w-4" aria-hidden />
          Close
        </button>
      </div>

      {/* Scrolls in both directions so a wide chart can be read at full size on a phone
          rather than being shrunk to fit and made illegible. */}
      <div className="flex-1 overflow-auto rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL, see above. */}
        <img
          src={chart.url}
          alt={`Chart from page ${chart.page} of the report, enlarged`}
          className="min-w-full max-w-none"
          style={{ width: Math.min(chart.width, 1600) }}
        />
      </div>
    </div>
  )
}
