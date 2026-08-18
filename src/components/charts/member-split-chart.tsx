import type { MemberSplit } from '@/lib/dashboard-stats'
import { CHART, EmptyChart } from '@/components/charts/chart-parts'

/**
 * The membership, split three ways.
 *
 * A donut earns its place here and rarely elsewhere. The three states are mutually
 * exclusive and together they are the whole list, the count is well under the six-segment
 * ceiling, and the job is a glance — "mostly active, a slice lapsed" — not a precise
 * comparison of near-equal values, which is what arcs are genuinely bad at. The exact
 * numbers sit in the legend and the stat tiles above, so nobody has to read an angle.
 *
 * The hole is not decoration: it holds the total, which is the number most often wanted
 * and would otherwise need a fourth stat tile.
 *
 * Colour follows the ordinal ramp, because these states are ordered — paying, not yet
 * paid, no longer paying — and the lightness carries that order without the legend.
 */
const SIZE = 200
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** A 2px surface gap between segments, in the same units as the arc lengths. */
const GAP = 2

const SEGMENTS: { key: keyof MemberSplit; label: string; colour: string }[] = [
  { key: 'active', label: 'Active', colour: CHART.strong },
  { key: 'pending', label: 'Paid, not redeemed', colour: CHART.mid },
  { key: 'lapsed', label: 'Lapsed', colour: CHART.weak },
]

export function MemberSplitChart({ split }: { split: MemberSplit }) {
  const total = split.active + split.pending + split.lapsed
  if (total === 0) return <EmptyChart message="No members yet." />

  const present = SEGMENTS.filter((segment) => split[segment.key] > 0)

  let offset = 0
  const arcs = present.map((segment) => {
    const value = split[segment.key]
    const length = (value / total) * CIRCUMFERENCE
    const arc = {
      ...segment,
      value,
      // The gap comes out of the arc, so the ring still closes exactly.
      dash: `${Math.max(length - GAP, 0.5)} ${CIRCUMFERENCE - Math.max(length - GAP, 0.5)}`,
      offset: -offset,
    }
    offset += length
    return arc
  })

  return (
    <figure className="m-0">
      {/*
        Stacked on a phone. Side by side at 390px the label column is squeezed under its
        own text and "Paid, not redeemed" collides with its count — caught by rendering
        it, not by reading it.
      */}
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[180px] w-[180px] shrink-0"
          role="img"
          aria-label={`${total} members: ${arcs
            .map((arc) => `${arc.value} ${arc.label.toLowerCase()}`)
            .join(', ')}.`}
        >
          {/* Rotated so the first segment starts at twelve o'clock, which is where a
              reader's eye begins. */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.colour}
                strokeWidth={STROKE}
                strokeDasharray={arc.dash}
                strokeDashoffset={arc.offset}
              >
                <title>{`${arc.label} — ${arc.value} of ${total}`}</title>
              </circle>
            ))}
          </g>

          <text
            x={SIZE / 2}
            y={SIZE / 2 - 2}
            textAnchor="middle"
            fill={CHART.ink}
            fontSize={34}
            fontFamily="var(--font-display), sans-serif"
          >
            {total}
          </text>
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 18}
            textAnchor="middle"
            fill={CHART.inkDim}
            fontSize={10}
            fontFamily="monospace"
            letterSpacing="1.4"
          >
            MEMBERS
          </text>
        </svg>

        <div className="w-full min-w-0 sm:flex-1">
          <ul className="space-y-2.5">
            {arcs.map((arc) => (
              <li key={arc.key} className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
                  style={{ background: arc.colour }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-[13px] text-ink-dim">{arc.label}</span>
                <span className="font-mono text-[13px] text-ink">{arc.value}</span>
                <span className="w-10 text-right font-mono text-[11px] text-ink-dim">
                  {Math.round((arc.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  )
}

