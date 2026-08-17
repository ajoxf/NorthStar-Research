/**
 * The chart palette and the small pieces every chart here shares.
 *
 * ## Colour
 *
 * One hue, stepped. The stack below encodes an **ordered** thing — read, opened,
 * delivered-but-unopened — where swapping the order would change the meaning, so it takes
 * a monotone lightness ramp rather than a categorical palette: the reader sees the order
 * in the colour without consulting the legend.
 *
 * The ramp was validated rather than eyeballed, against the panel surface `#0B0B0B`:
 * monotone lightness, adjacent gaps over 0.06, single hue (2° spread), and the light end
 * clearing the surface at 4.64:1.
 *
 * `FAILED` is a status colour, reserved and never reused as "series 4". It clears 3:1 on
 * the same surface and always ships beside a label.
 *
 * ## Marks
 *
 * Thin marks, 2px lines, 4px rounded ends on bars, a 2px surface-coloured gap between
 * stacked segments, recessive axes. Values are direct-labelled rather than left to hover
 * alone, which is also what lets these read without a pointer.
 */

export const CHART = {
  /** Ordinal ramp, brightest = most engaged. */
  strong: '#D0F53C',
  mid: '#9BBE2E',
  weak: '#6B8420',
  /** Reserved status. Never a series colour. */
  failed: '#FF4D5E',
  /** The panel these are drawn on; also the colour of the gaps between segments. */
  surface: '#0B0B0B',
  grid: '#1F1F1F',
  ink: '#FFFFFF',
  inkDim: '#A3A3A3',
} as const

export function ChartFrame({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-panel p-5">
      <h3 className="text-[15px] text-ink">{title}</h3>
      {note && <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

/**
 * A legend, shown whenever a chart carries more than one series.
 *
 * Present by rule, not by taste: identity must never rest on colour alone. The stacked
 * chart also direct-labels its segments, so the legend is the second of two encodings
 * rather than the only one.
 */
export function Legend({ items }: { items: { label: string; colour: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-[1px]"
            style={{ background: item.colour }}
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <p className="py-8 text-center font-mono text-[12px] text-ink-dim">{message}</p>
  )
}

/** Short label for an axis tick — "12 Aug" without the year, which repeats. */
export function shortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
