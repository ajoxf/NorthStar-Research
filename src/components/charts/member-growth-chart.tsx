import type { WeekPoint } from '@/lib/dashboard-stats'
import { CHART, EmptyChart, shortDate } from '@/components/charts/chart-parts'

/**
 * Members over time — one series, so an area rather than a categorical anything.
 *
 * A single series needs no legend: the title names it. The area is the accent hue at low
 * opacity under a 2px line, which is the whole colour story — there is no second series
 * to tell apart, so spending a second hue here would encode nothing.
 *
 * Every week in the window is plotted, including the empty ones. Drawing only the weeks
 * that had a signup and joining those points would run a straight diagonal across a quiet
 * month and read as steady growth, which is the opposite of what happened.
 */
const WIDTH = 560
const HEIGHT = 180
const PAD = { top: 12, right: 12, bottom: 24, left: 34 }

export function MemberGrowthChart({ weeks }: { weeks: WeekPoint[] }) {
  if (weeks.length < 2) return <EmptyChart message="Not enough history yet." />

  const max = Math.max(...weeks.map((week) => week.total), 1)
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom

  const x = (index: number) => PAD.left + (index / (weeks.length - 1)) * plotW
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH

  const line = weeks.map((week, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(week.total)}`).join(' ')
  const area = `${line} L ${x(weeks.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`

  // Three ticks: nothing is gained by labelling twelve weeks, and they collide.
  const tickIndexes = [0, Math.floor((weeks.length - 1) / 2), weeks.length - 1]
  const latest = weeks[weeks.length - 1]

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Members over the last ${weeks.length} weeks, ending at ${latest.total}.`}
      >
        {/* Recessive gridlines: present for reading values, never competing with the data. */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + plotH * fraction}
            y2={PAD.top + plotH * fraction}
            stroke={CHART.grid}
            strokeWidth={1}
          />
        ))}

        <text x={4} y={PAD.top + 4} fill={CHART.inkDim} fontSize={10} fontFamily="monospace">
          {max}
        </text>
        <text x={4} y={PAD.top + plotH + 4} fill={CHART.inkDim} fontSize={10} fontFamily="monospace">
          0
        </text>

        <path d={area} fill={CHART.strong} fillOpacity={0.12} />
        <path d={line} fill="none" stroke={CHART.strong} strokeWidth={2} strokeLinejoin="round" />

        {/* The end point is marked and labelled — the current total is the number the
            reader came for, and it should not require counting gridlines. */}
        <circle cx={x(weeks.length - 1)} cy={y(latest.total)} r={4} fill={CHART.strong} />

        {tickIndexes.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={HEIGHT - 6}
            fill={CHART.inkDim}
            fontSize={10}
            fontFamily="monospace"
            textAnchor={index === 0 ? 'start' : index === weeks.length - 1 ? 'end' : 'middle'}
          >
            {shortDate(weeks[index].weekStart)}
          </text>
        ))}

        {/* Native tooltips: a value per week without shipping a hover runtime to an
            admin page. The figure caption below carries the same numbers in text. */}
        {weeks.map((week, index) => (
          <rect
            key={week.weekStart.toISOString()}
            x={x(index) - plotW / (weeks.length * 2)}
            y={PAD.top}
            width={plotW / weeks.length}
            height={plotH}
            fill="transparent"
          >
            <title>{`${shortDate(week.weekStart)} — ${week.total} members (+${week.joined})`}</title>
          </rect>
        ))}
      </svg>

      <figcaption className="mt-2 font-mono text-[11px] text-ink-dim">
        {latest.total} members · {weeks.reduce((sum, week) => sum + week.joined, 0)} joined in{' '}
        {weeks.length} weeks
      </figcaption>
    </figure>
  )
}
