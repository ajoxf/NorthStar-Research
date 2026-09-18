import { cn } from '@/lib/utils'

/**
 * One horizontal band of the page, on one of three grounds.
 *
 * The reference design's whole character is the alternation — black, then light, then
 * black again — and the thing that goes wrong when that is hand-rolled per section is
 * that the *text* colours drift out of step with the background. A heading written
 * `text-ink` on a light band is white on near-white, invisible, and it looks fine in
 * every review until somebody opens the page.
 *
 * So the ground and the ink move together, always, decided once here. A band sets its own
 * background and the default text colour for everything inside it; children that need a
 * quieter tone use `text-current/70` or the matching dim token rather than naming a
 * colour that assumes a ground.
 *
 * `lime` is the cross-sell strip — rare, deliberately, because it is the loudest thing on
 * the site and stops working the moment there are two of them.
 */
export type BandTone = 'dark' | 'light' | 'lime'

const GROUND: Record<BandTone, string> = {
  dark: 'bg-bg text-ink',
  light: 'bg-paper text-ink-on-light',
  lime: 'bg-accent text-ink-on-light',
}

/** The hairline that shows on this ground. Near-black on light would be invisible. */
export const bandLine: Record<BandTone, string> = {
  dark: 'border-line',
  light: 'border-line-on-light',
  lime: 'border-ink-on-light/15',
}

/** The muted body colour for this ground. */
export const bandDim: Record<BandTone, string> = {
  dark: 'text-ink-dim',
  light: 'text-ink-on-light-dim',
  lime: 'text-ink-on-light/75',
}

export function Band({
  tone = 'dark',
  className,
  innerClassName,
  id,
  children,
}: {
  tone?: BandTone
  className?: string
  /** Applied to the centred column, for a band that needs a narrower measure. */
  innerClassName?: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn(GROUND[tone], className)}>
      {/*
        96px of vertical air at desktop, per the reference, stepping down on a phone where
        that much padding is most of a screen. The 1080px measure inside a 1280px frame is
        the design's own: it is why every band's content lines up down the page.
      */}
      <div className={cn('mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24', innerClassName)}>
        {children}
      </div>
    </section>
  )
}

/**
 * The small outlined uppercase label above a heading.
 *
 * Outlined rather than filled, and it takes its colour from the band it sits in — the
 * reference draws it in the band's ink on both grounds, not in the accent.
 */
export function Eyebrow({
  tone = 'dark',
  className,
  children,
}: {
  tone?: BandTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-4 py-1 text-[11px] font-medium uppercase tracking-[0.16em]',
        tone === 'dark' ? 'border-line text-ink-dim' : 'border-ink-on-light/35 text-ink-on-light',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * A heading at the reference's display size.
 *
 * 44px with -0.04em tracking and a leading of 1 is what makes those headings read as the
 * design rather than as large body text; the tracking is the part that is easy to drop and
 * the most obvious when it is missing.
 */
export function BandHeading({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <h2
      className={cn(
        'text-balance font-display text-[32px] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[44px]',
        className,
      )}
    >
      {children}
    </h2>
  )
}
