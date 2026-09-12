'use client'

import Image from 'next/image'
import * as React from 'react'

/**
 * What Nexus RAMP actually looks like.
 *
 * ## Why these are synthetic
 *
 * Every figure in these four screens comes from an invented book of crude and gas
 * calendar spreads, loaded into a build of the application with no database attached. Not
 * a stylistic choice: the desk's own screens show its real positions, real margin and a
 * year of real fills, and a marketing page is a public place. A screenshot cannot be
 * un-published.
 *
 * The numbers are nonetheless real arithmetic — the application computed them from the
 * invented fills, and each was checked by hand against the contract specifications
 * (WTI crude 1,000 bbl, Henry Hub gas 10,000 MMBtu) before these were taken. A demo with
 * impossible figures in it is worse than none, because the people looking are traders.
 *
 * ## Why a dialog rather than a lightbox library
 *
 * `<dialog>` gives the escape key, the backdrop click and the focus trap for free, in
 * every browser that matters, at no weight. A carousel would need all three written by
 * hand and would still be worse with a keyboard.
 */

const SHOTS = [
  {
    src: '/ramp/import.png',
    title: 'Bring in a broker file',
    caption:
      'Drop the fills export from TT or MT5 and every column is read back before anything is saved — spread orders and their legs recognised, duplicates skipped.',
  },
  {
    src: '/ramp/positions.png',
    title: 'The whole book, one screen',
    caption:
      'Open positions and closed trades side by side, across every broker account, with margin and room to a call on the figures the broker itself reported.',
  },
  {
    src: '/ramp/scenarios.png',
    title: 'Stress it before you trade it',
    caption:
      'Move every position against yourself and see what survives: margin after the move, what breaks first, and how many more lots you could carry and still clear your own minimum.',
  },
  {
    src: '/ramp/analysis.png',
    title: 'What actually made money',
    caption:
      'Realised performance by product and by month, from squared-off trades only — open positions are never counted as profit.',
  },
]

export function RampGallery() {
  const [open, setOpen] = React.useState<number | null>(null)
  const ref = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open !== null && !dialog.open) dialog.showModal()
    if (open === null && dialog.open) dialog.close()
  }, [open])

  const shot = open === null ? null : SHOTS[open]

  return (
    <div className="mt-10">
      <p className="eyebrow">A look inside</p>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
        Four screens from a demonstration book of crude and gas calendar spreads. The figures are
        the application&rsquo;s own arithmetic on invented trades — no customer&rsquo;s positions
        appear here.
      </p>

      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {SHOTS.map((item, index) => (
          <li key={item.src}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="group block w-full overflow-hidden rounded-lg border border-line bg-panel text-left transition-colors hover:border-accent/40"
            >
              {/*
                A fixed aspect box, so the grid does not reflow as each image arrives and
                the page stops jumping under somebody's cursor.
              */}
              <span className="relative block aspect-[1560/1020] w-full overflow-hidden bg-panel-2">
                <Image
                  src={item.src}
                  alt={`Nexus RAMP — ${item.title}`}
                  fill
                  sizes="(min-width: 640px) 45vw, 90vw"
                  className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </span>
              <span className="block px-4 py-3.5">
                <span className="text-[15px] text-ink">{item.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-dim">
                  {item.caption}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={ref}
        onClose={() => setOpen(null)}
        onClick={(event) => {
          // Backdrop clicks land on the dialog itself; clicks on the figure do not.
          if (event.target === ref.current) setOpen(null)
        }}
        className="w-[min(96vw,1560px)] max-w-none rounded-lg border border-line bg-panel p-0 backdrop:bg-black/80"
      >
        {shot && (
          <figure className="m-0">
            <img src={shot.src} alt={`Nexus RAMP — ${shot.title}`} className="block w-full" />
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-line px-5 py-4">
              <span className="text-[15px] text-ink">{shot.title}</span>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="text-[13px] text-accent underline underline-offset-4"
              >
                Close
              </button>
            </figcaption>
          </figure>
        )}
      </dialog>
    </div>
  )
}
