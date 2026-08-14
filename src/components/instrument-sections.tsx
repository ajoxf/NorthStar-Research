'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import type { ReportInstrument } from '@/lib/report-content'

/**
 * Stacked, one-per-instrument reading layout.
 *
 * The tabbed `InstrumentTable` is still right for the marketing preview, where the point
 * is to show the *format* compactly. Inside a report it hid work: a member reading the
 * commodities edition had to discover that four more instruments existed behind tabs, and
 * on a phone the tab strip scrolled off screen entirely. Here every instrument gets its
 * own band, so scrolling the report is the same gesture as reading it.
 *
 * Bands alternate black and white. That is not decoration — it is the segregation. Two
 * adjacent instruments can never blur into one another, and the boundary survives being
 * read at arm's length on a phone, where a hairline border does not.
 *
 * Consequence worth knowing: the light bands are genuinely light, in a product that is
 * otherwise true black. Up/down colours are therefore defined twice, because #00E08A on
 * white is close to unreadable.
 */
export function InstrumentSections({
  instruments,
  watermarkStyle,
  watermarkStyleLight,
}: {
  instruments: ReportInstrument[]
  /** Tile for the black bands — a pale mark on black. */
  watermarkStyle?: React.CSSProperties
  /** Tile for the white bands. A pale mark is invisible there, so it is inverted. */
  watermarkStyleLight?: React.CSSProperties
}) {
  if (instruments.length === 0) return null

  return (
    <section aria-label="Instrument levels">
      {instruments.length > 1 && <InstrumentJumpNav instruments={instruments} />}

      <div className="space-y-4 sm:space-y-5">
        {instruments.map((instrument, index) => (
          <InstrumentBand
            key={`${instrument.symbol}-${index}`}
            instrument={instrument}
            index={index}
            light={index % 2 === 1}
            watermarkStyle={index % 2 === 1 ? watermarkStyleLight : watermarkStyle}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Chips that jump to a band. On a four-to-six instrument report this is the difference
 * between reading and hunting; it scrolls horizontally rather than wrapping, so it stays
 * one row at phone width.
 */
function InstrumentJumpNav({ instruments }: { instruments: ReportInstrument[] }) {
  return (
    <nav
      aria-label="Jump to instrument"
      className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {instruments.map((instrument, index) => (
        <a
          key={`${instrument.symbol}-${index}`}
          href={`#instrument-${slug(instrument.symbol)}-${index}`}
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          {instrument.symbol}
        </a>
      ))}
    </nav>
  )
}

function InstrumentBand({
  instrument,
  index,
  light,
  watermarkStyle,
}: {
  instrument: ReportInstrument
  index: number
  light: boolean
  watermarkStyle?: React.CSSProperties
}) {
  const biasTone = toneClass(instrument.bias, light)

  return (
    <article
      id={`instrument-${slug(instrument.symbol)}-${index}`}
      // scroll-mt keeps the heading clear of the sticky portal header after a jump.
      className={cn(
        'watermarked scroll-mt-20 overflow-hidden rounded-2xl border',
        light ? 'border-black/10 bg-white text-black' : 'border-line bg-black text-ink',
      )}
      style={watermarkStyle}
    >
      <header
        className={cn(
          'flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b px-5 py-5 sm:px-7 sm:py-6',
          light ? 'border-black/10' : 'border-line',
        )}
      >
        <div className="min-w-0">
          <div
            className={cn(
              'mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em]',
              light ? 'text-black/45' : 'text-ink-dim',
            )}
          >
            Instrument {String(index + 1).padStart(2, '0')}
          </div>
          <h3
            className={cn(
              'font-mono text-2xl leading-none tracking-tight sm:text-3xl',
              light ? 'text-black' : 'text-ink',
            )}
          >
            {instrument.symbol}
          </h3>
          {instrument.name && (
            <div
              className={cn(
                'mt-1.5 truncate text-[14px]',
                light ? 'text-black/55' : 'text-ink-dim',
              )}
            >
              {instrument.name}
            </div>
          )}
        </div>

        {(instrument.last || instrument.change) && (
          <div className="text-right">
            <div className={cn('font-mono text-xl sm:text-2xl', light ? 'text-black' : 'text-ink')}>
              {instrument.last}
            </div>
            {instrument.change && (
              <div className={cn('mt-0.5 font-mono text-[13px]', biasTone)}>{instrument.change}</div>
            )}
          </div>
        )}
      </header>

      {/* Definition list, not a <table>: it reflows to a single column on a phone instead
          of scrolling sideways. */}
      <dl className={cn('divide-y', light ? 'divide-black/10' : 'divide-line')}>
        {instrument.rows.map((row, rowIndex) => (
          <div
            key={`${row.label}-${rowIndex}`}
            className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 sm:px-7"
          >
            <dt
              className={cn(
                'font-mono text-[11px] uppercase tracking-[0.12em]',
                light ? 'text-black/50' : 'text-ink-dim',
              )}
            >
              {row.label}
            </dt>
            <dd
              className={cn(
                'font-mono text-[15px] sm:text-right',
                toneClass(row.bias, light, light ? 'text-black' : 'text-ink'),
              )}
            >
              {row.value}
              {row.note && (
                <span className={cn('ml-2', light ? 'text-black/50' : 'text-ink-dim')}>
                  {row.note}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {instrument.commentary && (
        <div
          className={cn(
            'border-t px-5 py-5 text-[15px] leading-relaxed sm:px-7',
            light ? 'border-black/10 text-black/70' : 'border-line text-ink-dim',
          )}
        >
          {instrument.commentary}
        </div>
      )}
    </article>
  )
}

/**
 * Up/down colours per band. The dark tokens are tuned for #000 and fail contrast on
 * white, so the light bands get their own darker pair rather than the same hex at
 * reduced opacity.
 */
function toneClass(
  bias: 'up' | 'down' | 'neutral' | undefined,
  light: boolean,
  neutral?: string,
): string {
  if (bias === 'up') return light ? 'text-[#0B7A4B]' : 'text-up'
  if (bias === 'down') return light ? 'text-[#B31D2B]' : 'text-down'
  return neutral ?? (light ? 'text-black/55' : 'text-ink-dim')
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
