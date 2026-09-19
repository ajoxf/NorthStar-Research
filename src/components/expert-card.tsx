import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { authorInitials } from '@/lib/section-shape'

/**
 * One expert, as a card a member opens.
 *
 * The reference's shape: a wide tile filled by a photograph, the name set large at the top
 * left, a single action pill at the foot. Three across on a desktop, and the proportion is
 * part of it — a 16:9 tile with the name at display size reads as a cover, where a squarer
 * one reads as a contact card.
 *
 * The name sits at the top rather than over the foot because the foot is where the button
 * goes, and two things competing for the same corner is what makes these cards feel
 * crowded at small sizes.
 *
 * **The scrim is not decoration.** A photograph uploaded by somebody else can be any
 * brightness anywhere, so the name is laid over a gradient that is opaque at the top and
 * clear by the middle — the text stays readable over a white shirt or a window without
 * anybody checking each photograph by hand.
 *
 * No photograph is a designed state, not a gap: initials at display size on the panel
 * ground, so a grid of three keeps three equal tiles.
 */
export function ExpertCard({
  href,
  name,
  meta,
  photoUrl,
  topics,
  action = 'View reports',
}: {
  href: string
  name: string
  photoUrl?: string | null
  /** The subjects of theirs this member holds. */
  topics?: string[]
  /** One line under the name — a report count, a last-published date. */
  meta?: string
  action?: string
}) {
  /*
   * Subjects and the count on one line, not as separate chips.
   *
   * They were three or four small pills, which at this card size competed with the name
   * for the eye and made the tile look busy beside the reference's. They are the same
   * facts either way, and as one quiet line they sit under the name where a subtitle goes.
   */
  const subtitle = [topics?.slice(0, 3).join(' · '), meta].filter(Boolean).join(' — ')

  return (
    <Link
      href={href}
      className="group relative flex aspect-[16/9] flex-col justify-between overflow-hidden rounded-2xl border border-line bg-panel-2 p-6 transition-colors hover:border-accent/45"
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
        /*
          A watermark in the corner, not a monogram in the middle.

          Centred, it landed underneath the name and the subtitle — two pieces of type
          over one another, which looks like a rendering fault rather than a portrait
          nobody has supplied yet. Bottom right is the one part of the tile neither the
          name (top left) nor the pill (bottom left) uses.
        */
        <span
          aria-hidden
          className="absolute -bottom-2 right-4 font-mono text-7xl leading-none text-white/15"
        >
          {authorInitials(name)}
        </span>
      )}

      {/* Dark at the top where the name is, clearing by the middle so the face shows, and
          darkening again at the foot so the pill has something to sit on. */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/35 to-black/75"
        aria-hidden
      />

      <div className="relative">
        <h3 className="text-balance font-display text-[26px] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[30px]">
          {name}
        </h3>
        {subtitle && (
          <p className="mt-2 line-clamp-1 text-[13px] text-white/75">{subtitle}</p>
        )}
      </div>

      <div className="relative">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-[13px] font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-accent group-hover:text-ink-on-light">
          {action}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
