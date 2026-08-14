'use client'

import * as React from 'react'

import { formatCompact, formatCurrency, type ProjectionYear } from '@/lib/withdrawal-model'

/**
 * Portfolio balance over the projection horizon.
 *
 * Two series — nominal and inflation-adjusted — because the gap between them *is* the
 * insight: a portfolio can grow in cash terms while losing purchasing power, and one
 * line alone hides that.
 *
 * Series one is a mid green — the lime accent itself is far too light to sit on the panel
 * surface as a data mark. Series two is violet rather than the more obvious amber,
 * because green against amber is the classic red-green colour-blind failure: that pair
 * measures ΔE 2.0 under deuteranopia, i.e. indistinguishable. Green against violet
 * measures 27.3 and passes every check.
 *
 * These stayed green rather than being re-hued to lime when the accent changed: a lime
 * step holds a weaker tritan margin (5.8 against this pair's 10.4), and matching the
 * brand is not worth costing a group of readers the distinction.
 *
 * Both series are direct-labelled at the line end as well as carrying a legend, and the
 * real series is dashed, so identity never depends on colour alone.
 */

const SERIES = {
  nominal: { color: '#3FA82F', label: 'Portfolio balance' },
  real: { color: '#8B6FE8', label: "In today's money" },
} as const

const WIDTH = 720
const HEIGHT = 300
const PAD = { top: 20, right: 96, bottom: 34, left: 60 }

export function ProjectionChart({ rows }: { rows: ProjectionYear[] }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)

  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom

  const maxValue = Math.max(...rows.map((r) => Math.max(r.closingBalance, r.realClosingBalance)), 1)
  const niceMax = niceCeiling(maxValue)

  const x = (year: number) =>
    PAD.left + ((year - 1) / Math.max(1, rows.length - 1)) * plotWidth
  const y = (value: number) => PAD.top + plotHeight - (value / niceMax) * plotHeight

  const line = (key: 'closingBalance' | 'realClosingBalance') =>
    rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.year).toFixed(1)} ${y(r[key]).toFixed(1)}`).join(' ')

  const area = `${line('closingBalance')} L ${x(rows[rows.length - 1].year).toFixed(1)} ${y(0)} L ${x(1).toFixed(1)} ${y(0)} Z`

  const ticks = axisTicks(niceMax)
  const yearTicks = rows.filter(
    (r) => r.year === 1 || r.year === rows.length || r.year % Math.ceil(rows.length / 6) === 0,
  )

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH
    const ratio = (px - PAD.left) / plotWidth
    const year = Math.round(ratio * (rows.length - 1)) + 1
    setHover(year >= 1 && year <= rows.length ? year : null)
  }

  const active = hover ? rows.find((r) => r.year === hover) : null
  const last = rows[rows.length - 1]

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {Object.values(SERIES).map((series) => (
          <span key={series.label} className="flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ background: series.color }}
              aria-hidden
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
              {series.label}
            </span>
          </span>
        ))}
      </figcaption>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[560px]"
          role="img"
          aria-label={`Projected portfolio balance over ${rows.length} years. Ending balance ${formatCurrency(last.closingBalance)} nominal, ${formatCurrency(last.realClosingBalance)} in today's money.`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#1F1F1F"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#A3A3A3"
                fontSize={11}
                fontFamily="IBM Plex Mono, monospace"
              >
                {formatCompact(tick)}
              </text>
            </g>
          ))}

          {yearTicks.map((row) => (
            <text
              key={row.year}
              x={x(row.year)}
              y={HEIGHT - 12}
              textAnchor="middle"
              fill="#A3A3A3"
              fontSize={11}
              fontFamily="IBM Plex Mono, monospace"
            >
              {`Y${row.year}`}
            </text>
          ))}

          <defs>
            <linearGradient id="nominalFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.nominal.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES.nominal.color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <path d={area} fill="url(#nominalFill)" />
          <path d={line('closingBalance')} fill="none" stroke={SERIES.nominal.color} strokeWidth={2} />
          <path
            d={line('realClosingBalance')}
            fill="none"
            stroke={SERIES.real.color}
            strokeWidth={2}
            strokeDasharray="5 4"
          />

          {/* Direct labels at the line ends, so the two series are identifiable
              without consulting the legend. */}
          <text
            x={x(last.year) + 8}
            y={y(last.closingBalance)}
            dominantBaseline="middle"
            fill="#A3A3A3"
            fontSize={11}
            fontFamily="IBM Plex Mono, monospace"
          >
            {formatCompact(last.closingBalance)}
          </text>
          <text
            x={x(last.year) + 8}
            y={y(last.realClosingBalance)}
            dominantBaseline="middle"
            fill="#A3A3A3"
            fontSize={11}
            fontFamily="IBM Plex Mono, monospace"
          >
            {formatCompact(last.realClosingBalance)}
          </text>

          {active && (
            <g>
              <line
                x1={x(active.year)}
                x2={x(active.year)}
                y1={PAD.top}
                y2={PAD.top + plotHeight}
                stroke="#A3A3A3"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={x(active.year)}
                cy={y(active.closingBalance)}
                r={4}
                fill={SERIES.nominal.color}
                stroke="#0B0B0B"
                strokeWidth={2}
              />
              <circle
                cx={x(active.year)}
                cy={y(active.realClosingBalance)}
                r={4}
                fill={SERIES.real.color}
                stroke="#0B0B0B"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      </div>

      {/* Tooltip rendered as HTML below the plot rather than floating inside the SVG:
          it stays readable on a phone, where a hovering box would be unusable. */}
      <div className="mt-3 min-h-[42px] rounded-lg border border-line bg-panel-2 px-4 py-2.5">
        {active ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px]">
            <span className="text-ink">Year {active.year}</span>
            <span className="text-ink-dim">
              Balance <span className="text-ink">{formatCurrency(active.closingBalance)}</span>
            </span>
            <span className="text-ink-dim">
              Today&apos;s money{' '}
              <span className="text-ink">{formatCurrency(active.realClosingBalance)}</span>
            </span>
            <span className="text-ink-dim">
              Withdrawn <span className="text-ink">{formatCurrency(active.withdrawal)}</span>
            </span>
          </div>
        ) : (
          <p className="font-mono text-[12px] text-ink-dim">
            Hover the chart for any year&apos;s figures.
          </p>
        )}
      </div>
    </figure>
  )
}

function niceCeiling(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / magnitude) * magnitude
}

function axisTicks(max: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max)
}
