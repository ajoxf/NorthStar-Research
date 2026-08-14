'use client'

import * as React from 'react'
import { Lock } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReportInstrument } from '@/lib/report-content'

/**
 * Tabbed instrument selector over a data table (build spec §16).
 *
 * One component serves both audiences: logged-out visitors get `locked`, which blurs
 * the sample data behind an explanatory overlay; members get the same layout unlocked
 * with the real rows. Using one component is what keeps the marketing page and the
 * member reader feeling like a single product rather than two.
 */
export function InstrumentTable({
  instruments,
  locked = false,
  className,
}: {
  instruments: ReportInstrument[]
  locked?: boolean
  className?: string
}) {
  const [active, setActive] = React.useState(0)
  const current = instruments[active]

  if (!current) return null

  return (
    <div className={cn('panel overflow-hidden', className)}>
      {/* Tabs: horizontally scrollable on narrow screens rather than wrapping into a
          ragged block or forcing the page to scroll sideways. */}
      <div
        role="tablist"
        aria-label="Instrument"
        className="flex overflow-x-auto border-b border-line bg-panel-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {instruments.map((instrument, index) => (
          <button
            key={instrument.symbol}
            role="tab"
            type="button"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={cn(
              'relative shrink-0 px-4 py-3 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors',
              index === active ? 'text-accent' : 'text-ink-dim hover:text-ink',
            )}
          >
            {instrument.symbol}
            {index === active && (
              <span className="absolute inset-x-2 bottom-0 h-px bg-accent" aria-hidden />
            )}
          </button>
        ))}
      </div>

      <div className="relative">
        <div
          className={cn(
            'transition-[filter,opacity] duration-300',
            locked && 'pointer-events-none select-none blur-[5px] opacity-60',
          )}
          aria-hidden={locked}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <div className="font-display text-lg text-ink">{current.name ?? current.symbol}</div>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                {current.symbol}
              </div>
            </div>
            {(current.last || current.change) && (
              <div className="text-right">
                <div className="font-mono text-lg text-ink">{current.last}</div>
                <div
                  className={cn(
                    'font-mono text-[12px]',
                    current.bias === 'up' && 'text-up',
                    current.bias === 'down' && 'text-down',
                    current.bias === 'neutral' && 'text-ink-dim',
                  )}
                >
                  {current.change}
                </div>
              </div>
            )}
          </div>

          {/* Definition-list layout, not a wide <table>: it reads correctly at phone
              width without horizontal scrolling, which §6 calls out explicitly. */}
          <dl className="divide-y divide-line">
            {current.rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    'font-mono text-[14px] sm:text-right',
                    row.bias === 'up' && 'text-up',
                    row.bias === 'down' && 'text-down',
                    (!row.bias || row.bias === 'neutral') && 'text-ink',
                  )}
                >
                  {row.value}
                  {row.note && <span className="ml-2 text-ink-dim">{row.note}</span>}
                </dd>
              </div>
            ))}
          </dl>

          {current.commentary && (
            <div className="border-t border-line px-5 py-4 text-[15px] leading-relaxed text-ink-dim">
              {current.commentary}
            </div>
          )}
        </div>

        {locked && <LockedOverlay />}
      </div>
    </div>
  )
}

function LockedOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-bg/70 via-bg/85 to-bg/95 px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
          <Lock className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <h3 className="mb-2 font-display text-xl text-ink">Members only</h3>
        <p className="mb-5 text-[14px] leading-relaxed text-ink-dim">
          Levels, bias and positioning notes for every instrument are published to members three
          times a week. This preview shows the format — the numbers are illustrative.
        </p>
        <ButtonLink href="/join" size="md">
          Unlock Full Report
        </ButtonLink>
      </div>
    </div>
  )
}
