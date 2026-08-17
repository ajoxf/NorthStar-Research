import type { DeliveryBreakdown } from '@/lib/dashboard-stats'
import { CHART, EmptyChart, Legend } from '@/components/charts/chart-parts'

/**
 * What happened to each report's send — a stacked bar of mutually exclusive outcomes.
 *
 * Exclusive is what makes the stack honest. A member who read the report also received
 * it, so counting them under both "delivered" and "read" would draw a bar longer than the
 * number of people it went to. Every recipient sits in exactly one segment here.
 *
 * The three engagement segments are **ordinal** — read is more than opened is more than
 * merely delivered — so they take one hue in monotone lightness steps rather than three
 * unrelated colours: the order is visible in the colour itself. `Failed` is a reserved
 * status colour, never a fourth series, and it always appears beside its label.
 *
 * A 2px surface-coloured gap separates segments, so adjacent steps of the same hue stay
 * countable rather than merging into one band.
 */
/*
 * Sized in the coordinate space this chart is actually displayed at.
 *
 * It spans both columns, so a 560-wide viewBox would be scaled up roughly 2x by the
 * browser — taking 11px labels to 22px and making this the loudest text on the page. The
 * viewBox matches the rendered width instead, so a font size here means what it says.
 */
const WIDTH = 1120
const ROW_HEIGHT = 38
const BAR_HEIGHT = 16
const LABEL_W = 300
const GAP = 2

export function DeliveryChart({ reports }: { reports: DeliveryBreakdown[] }) {
  const withSends = reports.filter((report) => report.total > 0)
  if (withSends.length === 0) {
    return <EmptyChart message="No reports have been sent yet." />
  }

  const plotW = WIDTH - LABEL_W
  const height = withSends.length * ROW_HEIGHT

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Outcome of each report send, split into read, opened, delivered and failed."
      >
        {withSends.map((report, index) => {
          const y = index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
          const segments = [
            { label: 'Read', value: report.read, colour: CHART.strong },
            { label: 'Opened', value: report.openedNotRead, colour: CHART.mid },
            { label: 'Delivered', value: report.deliveredNotOpened, colour: CHART.weak },
            { label: 'Failed', value: report.failed, colour: CHART.failed },
          ].filter((segment) => segment.value > 0)

          let offset = 0
          return (
            <g key={report.id}>
              <text
                x={0}
                y={index * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
                fill={CHART.inkDim}
                fontSize={12}
                fontFamily="monospace"
              >
                {truncate(report.title, 34)}
                <title>{report.title}</title>
              </text>

              {segments.map((segment, segmentIndex) => {
                const share = segment.value / report.total
                const rawW = share * plotW
                // The gap is taken off every segment but the last, so the row still ends
                // flush and the widths stay proportional to the counts.
                const w = Math.max(rawW - (segmentIndex < segments.length - 1 ? GAP : 0), 1)
                const x = LABEL_W + offset
                offset += rawW

                return (
                  <g key={segment.label}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={BAR_HEIGHT}
                      rx={segments.length === 1 ? 4 : 2}
                      fill={segment.colour}
                    >
                      <title>{`${report.title} — ${segment.label}: ${segment.value} of ${report.total}`}</title>
                    </rect>
                    {/* Direct label, but only where the segment is wide enough to hold
                        one. A number crushed into a 6px sliver is noise, and the tooltip
                        and the engagement table below both carry the exact figure. */}
                    {w > 30 && (
                      <text
                        x={x + w / 2}
                        y={y + BAR_HEIGHT - 3.5}
                        fill={CHART.surface}
                        fontSize={10}
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        {segment.value}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      <Legend
        items={[
          { label: 'Read', colour: CHART.strong },
          { label: 'Opened', colour: CHART.mid },
          { label: 'Delivered', colour: CHART.weak },
          { label: 'Failed', colour: CHART.failed },
        ]}
      />
    </figure>
  )
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}
