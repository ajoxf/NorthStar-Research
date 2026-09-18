import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { authorInitials } from '@/lib/section-shape'

/**
 * One expert, as a card a member opens.
 *
 * The reference's shape: a picture filling the tile, the name at the top, an action pill
 * at the foot. The name sits at the top rather than over the foot because the foot is
 * where the button goes, and two things competing for the same corner is what makes these
 * cards feel crowded at small sizes.
 *
 * **The scrim is not decoration.** A photograph uploaded by somebody else can be any
 * brightness anywhere, so the name is laid over a gradient that is opaque at the top and
 * clear by the middle — the text stays readable over a white shirt or a window without
 * anybody checking each photograph by hand.
 *
 * No photograph is a designed state, not a gap: initials at display size on the panel
 * ground, so a grid of four keeps four equal tiles.
 */
export function ExpertCard({
  href,
  name,
  headline,
  photoUrl,
  topics,
  meta,
  action = 'View reports',
}: {
  href: string
  name: string
  headline?: string | null
  photoUrl?: string | null
  /** The subjects of theirs this member holds. */
  topics?: string[]
  /** One line under the name — a report count, a last-published date. */
  meta?: string
  action?: string
}) {
  return (
    <Link
      href={href}
      className="group relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-2xl border border-line bg-panel-2 p-6 transition-colors hover:border-accent/45"
    >
      {photoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary host, which
           next/image would need configuring for one URL at a time. */
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-mono text-6xl text-ink-dim/50"
        >
          {authorInitials(name)}
        </span>
      )}

      {/* Dark at the top where the name is, clearing by the middle so the face shows. */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/35 to-black/70"
        aria-hidden
      />

      <div className="relative">
        <h3 className="text-balance font-display text-[22px] font-medium leading-[1.15] tracking-[-0.03em] text-white sm:text-[26px]">
          {name}
        </h3>
        {headline && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-white/75">{headline}</p>
        )}
        {/*
          Subjects and the count share one row.

          The count started life beside the button at the foot, where it was the only thing
          competing with it for that corner and got clipped on a narrow card. It belongs
          with the other small facts about the person, not with the action.
        */}
        {((topics && topics.length > 0) || meta) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topics?.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-white/25 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm"
              >
                {topic}
              </span>
            ))}
            {meta && (
              <span className="rounded-full border border-white/25 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm">
                {meta}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-accent group-hover:text-ink-on-light">
          {action}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
