import type { ReadRatePoint } from '@/lib/dashboard-stats'
import { CHART, EmptyChart, shortDate } from '@/components/charts/chart-parts'

/**
 * What share of each edition's recipients actually read it.
 *
 * The one line worth watching. Raw read counts rise with the list whether or not the
 * research is landing; this holds the list size constant and asks whether people still
 * open it — so a flat line during growth is good news and a falling line during growth
 * is the thing to catch early.
 *
 * A single series, so no legend: the title names it. The scale is pinned to 0–100%
 * rather than fitted to the data, because an auto-fitted axis turns a wobble between 61%
 * and 64% into a dramatic cliff, which is the most common way a line chart lies.
 *
 * Editions that reached nobody break the line instead of plotting zero. A gap reads as
 * "no data"; a zero reads as "nobody read it", and those are different facts.
 */
const WIDTH = 560
const HEIGHT = 200
const PAD = { top: 14, right: 14, bottom: 26, left: 38 }

export function ReadRateChart({ points }: { points: ReadRatePoint[] }) {
  const usable = points.filter((point) => point.rate !== null)
  if (usable.length < 2) return <EmptyChart message="Not enough editions yet." />

  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom

  const x = (index: number) => PAD.left + (index / (points.length - 1)) * plotW
  const y = (rate: number) => PAD.top + plotH - rate * plotH

  // Segments rather than one path, so a report that reached nobody leaves a gap.
  const segments: string[] = []
  let current: string[] = []
  points.forEach((point, index) => {
    if (point.rate === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x(index)} ${y(point.rate)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  const latest = usable[usable.length - 1]
  const latestIndex = points.findIndex((point) => point.id === latest.id)
  const average = usable.reduce((sum, point) => sum + (point.rate ?? 0), 0) / usable.length

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Read rate per edition. Latest ${Math.round((latest.rate ?? 0) * 100)} percent, average ${Math.round(average * 100)} percent.`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(fraction)}
              y2={y(fraction)}
              stroke={CHART.grid}
              strokeWidth={1}
            />
            <text x={4} y={y(fraction) + 3.5} fill={CHART.inkDim} fontSize={10} fontFamily="monospace">
              {Math.round(fraction * 100)}%
            </text>
          </g>
        ))}

        {/* The average, so a single edition is read against the norm rather than in
            isolation. Drawn recessive — it is context, not a target anyone set. */}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={y(average)}
          y2={y(average)}
          stroke={CHART.weak}
          strokeWidth={1}
        />
        <text
          x={WIDTH - PAD.right}
          y={y(average) - 5}
          fill={CHART.weak}
          fontSize={10}
          fontFamily="monospace"
          textAnchor="end"
        >
          avg {Math.round(average * 100)}%
        </text>

        {segments.map((path) => (
          <path
            key={path}
            d={path}
            fill="none"
            stroke={CHART.strong}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Every point marked: with a handful of editions each one is a real event, and
            the markers are what the tooltips hang off. */}
        {points.map((point, index) =>
          point.rate === null ? null : (
            <circle
              key={point.id}
              cx={x(index)}
              cy={y(point.rate)}
              r={index === latestIndex ? 4.5 : 3}
              fill={CHART.strong}
              stroke={CHART.surface}
              strokeWidth={2}
            >
              <title>{`${point.title} — ${Math.round(point.rate * 100)}% of ${point.reached}`}</title>
            </circle>
          ),
        )}

        {/* Only the endpoint is labelled. A number on every point is chaos. */}
        {latest.rate !== null && (
          <text
            x={x(latestIndex)}
            y={y(latest.rate) - 12}
            fill={CHART.ink}
            fontSize={12}
            fontFamily="monospace"
            textAnchor={latestIndex === points.length - 1 ? 'end' : 'middle'}
          >
            {Math.round(latest.rate * 100)}%
          </text>
        )}

        {[0, points.length - 1].map((index) => (
          <text
            key={index}
            x={x(index)}
            y={HEIGHT - 6}
            fill={CHART.inkDim}
            fontSize={10}
            fontFamily="monospace"
            textAnchor={index === 0 ? 'start' : 'end'}
          >
            {shortDate(points[index].publishDate)}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 font-mono text-[11px] text-ink-dim">
        Latest {Math.round((latest.rate ?? 0) * 100)}% · average {Math.round(average * 100)}% across{' '}
        {usable.length} editions
      </figcaption>
    </figure>
  )
}
