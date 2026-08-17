import type { ReportReads } from '@/lib/dashboard-stats'
import { CHART, EmptyChart } from '@/components/charts/chart-parts'

/**
 * Reads per report — horizontal bars, because report titles are long.
 *
 * One hue for every bar. Colouring bars by their own value would spend the identity
 * channel re-encoding what bar length already shows, and these titles are nominal: no
 * order is implied by which report sits above which beyond recency.
 *
 * Every bar is direct-labelled, so the chart reads without a pointer and without counting
 * gridlines — which is also why no axis is drawn.
 */
const ROW_HEIGHT = 30
const BAR_HEIGHT = 12
const LABEL_W = 190
const VALUE_W = 34

export function ReadsChart({ reports }: { reports: ReportReads[] }) {
  if (reports.length === 0) return <EmptyChart message="No published reports yet." />

  const max = Math.max(...reports.map((report) => report.reads), 1)
  const width = 560
  const plotW = width - LABEL_W - VALUE_W
  const height = reports.length * ROW_HEIGHT

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Distinct members who read each of the last ${reports.length} reports.`}
      >
        {reports.map((report, index) => {
          const y = index * ROW_HEIGHT
          const barW = Math.max((report.reads / max) * plotW, report.reads > 0 ? 3 : 0)
          return (
            <g key={report.id}>
              <text
                x={0}
                y={y + ROW_HEIGHT / 2 + 4}
                fill={CHART.inkDim}
                fontSize={11}
                fontFamily="monospace"
              >
                {truncate(report.title, 28)}
                <title>{report.title}</title>
              </text>

              {/* Track, so a zero-read report is visibly zero rather than absent. */}
              <rect
                x={LABEL_W}
                y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                width={plotW}
                height={BAR_HEIGHT}
                rx={4}
                fill={CHART.grid}
              />
              <rect
                x={LABEL_W}
                y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                width={barW}
                height={BAR_HEIGHT}
                rx={4}
                fill={CHART.strong}
              >
                <title>{`${report.title} — ${report.reads} read`}</title>
              </rect>

              <text
                x={width}
                y={y + ROW_HEIGHT / 2 + 4}
                fill={CHART.ink}
                fontSize={11}
                fontFamily="monospace"
                textAnchor="end"
              >
                {report.reads}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}
