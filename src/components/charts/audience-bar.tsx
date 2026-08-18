import { CHART, Legend } from '@/components/charts/chart-parts'
import { type AudienceCounts } from '@/lib/audience-shape'

/**
 * One report's audience as a single horizontal bar.
 *
 * Part-to-whole, so a stacked bar rather than a donut: the segments here are close in
 * size and the reader's job is to compare them, which is exactly what arc lengths are
 * bad at. Horizontal because the labels are phrases, not words.
 *
 * The states are **ordered** — read, opened, unopened, failed, never sent — so they take
 * the monotone ordinal ramp rather than a categorical palette. The reader sees how far
 * each group got in the lightness itself, without consulting the legend. That ramp is
 * validated against this surface rather than eyeballed (see chart-parts.tsx).
 *
 * `failed` keeps the reserved status colour and `not_sent` is drawn in the grid tone:
 * neither is a degree of engagement, and putting them on the ramp would imply they were.
 */
const SEGMENTS: { key: keyof AudienceCounts; label: string; colour: string }[] = [
  { key: 'read', label: 'Read', colour: CHART.strong },
  { key: 'opened', label: 'Opened', colour: CHART.mid },
  { key: 'delivered', label: 'Unopened', colour: CHART.weak },
  { key: 'failed', label: 'Failed', colour: CHART.failed },
  { key: 'not_sent', label: 'Never sent', colour: CHART.grid },
]

const HEIGHT = 28
const GAP = 2

export function AudienceBar({ counts }: { counts: AudienceCounts }) {
  const total = SEGMENTS.reduce((sum, segment) => sum + counts[segment.key], 0)
  if (total === 0) return null

  const present = SEGMENTS.filter((segment) => counts[segment.key] > 0)

  // Widths in percent so the bar is fluid; the 2px gaps come out of the segment, which
  // keeps the total exactly 100% at any container width.
  let offset = 0
  const placed = present.map((segment) => {
    const share = counts[segment.key] / total
    const position = { ...segment, left: offset * 100, width: share * 100, count: counts[segment.key] }
    offset += share
    return position
  })

  return (
    <figure className="m-0">
      <div
        className="relative w-full overflow-hidden rounded"
        style={{ height: HEIGHT, background: CHART.surface }}
        role="img"
        aria-label={placed
          .map((segment) => `${segment.label}: ${segment.count}`)
          .join(', ')}
      >
        {placed.map((segment) => (
          <div
            key={segment.key}
            className="absolute top-0 h-full"
            style={{
              left: `${segment.left}%`,
              width: `calc(${segment.width}% - ${GAP}px)`,
              background: segment.colour,
              borderRadius: 4,
            }}
            title={`${segment.label} — ${segment.count}`}
          />
        ))}
      </div>

      <Legend
        items={placed.map((segment) => ({
          label: `${segment.label} ${segment.count}`,
          colour: segment.colour,
        }))}
      />
    </figure>
  )
}
