import type { DayPoint } from '@/lib/partner-report-shape'
import { CHART, EmptyChart } from '@/components/charts/chart-parts'

/**
 * One column per day, for a partner's period view.
 *
 * One hue; the busiest day and the total are labelled, so the chart reads without a pointer.
 * A year is drawn as weeks rather than 365 hairlines, which would be noise.
 */
export function DailyBars({
  points,
  format = (value) => String(value),
  label,
}: {
  points: DayPoint[]
  format?: (value: number) => string
  /** What the bars count, for screen readers: "Clicks per day". */
  label: string
}) {
  const bars = points.length > 120 ? byWeek(points) : points
  const max = Math.max(...bars.map((point) => point.value), 0)
  if (max === 0) return <EmptyChart message="Nothing in this period." />

  const width = 560
  const height = 120
  const top = 16
  const gap = bars.length > 60 ? 1 : 2
  const barW = Math.max(1, (width - gap * (bars.length - 1)) / bars.length)
  const busiest = bars.reduce((best, point) => (point.value > best.value ? point : best), bars[0])

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="h-auto w-full" role="img" aria-label={`${label}. Highest ${format(busiest.value)} on ${busiest.day}.`}>
        <line x1={0} x2={width} y1={height} y2={height} stroke={CHART.grid} strokeWidth={1} />
        {bars.map((point, index) => {
          const h = point.value > 0 ? Math.max(2, (point.value / max) * (height - top)) : 0
          const x = index * (barW + gap)
          return (
            <rect key={point.day} x={x} y={height - h} width={barW} height={h} rx={Math.min(2, barW / 2)} fill={point === busiest ? CHART.strong : CHART.mid}>
              <title>{`${point.day}: ${format(point.value)}`}</title>
            </rect>
          )
        })}
        <text x={0} y={height + 14} fill={CHART.inkDim} fontSize={10} fontFamily="monospace">{bars[0].day}</text>
        <text x={width} y={height + 14} fill={CHART.inkDim} fontSize={10} fontFamily="monospace" textAnchor="end">{bars[bars.length - 1].day}</text>
        <text
          x={Math.min(Math.max(bars.indexOf(busiest) * (barW + gap) + barW / 2, 30), width - 30)}
          y={10}
          fill={CHART.ink}
          fontSize={10}
          fontFamily="monospace"
          textAnchor="middle"
        >
          {format(busiest.value)}
        </text>
      </svg>
    </figure>
  )
}

function byWeek(points: DayPoint[]): DayPoint[] {
  const weeks: DayPoint[] = []
  for (let index = 0; index < points.length; index += 7) {
    const slice = points.slice(index, index + 7)
    weeks.push({ day: slice[0].day, value: slice.reduce((sum, point) => sum + point.value, 0) })
  }
  return weeks
}
