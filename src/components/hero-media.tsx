import Image from 'next/image'

import { HeroVideo } from '@/components/hero-video'

/**
 * The hero backdrop.
 *
 * A photograph, not a rectangle with a photograph in it. The image is masked so its left
 * and lower edges dissolve into the page's true black rather than ending at a border —
 * that dissolve is the whole effect, and it only works because the background really is
 * #000: any panel grey behind it and the fade shows its seam.
 *
 * Composition drives the crop. The subject sits right of centre with the trading floor
 * falling away to the left, so on a wide screen the photo is anchored right and the
 * headline occupies the dark half it leaves behind. On a phone there is no room for two
 * halves, so the photo becomes a full-bleed backdrop under a heavier scrim and the
 * headline sits over it.
 *
 * Grading is restrained on purpose: slightly desaturated and lifted in contrast so it
 * reads as a newsroom still rather than stock photography, with a faint lime bloom low
 * on the frame picking up the screen glow. No lime cast over the subject — tinting a
 * person the brand colour looks like a filter, not like design.
 */
export function HeroMedia({
  image,
  videoSrc,
  videoPoster,
}: {
  image: string
  videoSrc?: string
  videoPoster?: string
}) {
  // Configured footage supersedes the still entirely; it carries its own scrim.
  if (videoSrc) {
    return <HeroVideo src={videoSrc} poster={videoPoster ?? image} />
  }

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-y-0 right-0 w-full lg:w-[64%]"
        style={{
          // Horizontal dissolve into the page. Two mask properties rather than one so
          // Safari, which still wants the prefix, fades it too instead of showing a hard
          // edge down the middle of the hero.
          maskImage: 'linear-gradient(to right, transparent 0%, #000 45%, #000 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 45%, #000 100%)',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            // Shallow at the top: the subject's head sits high in the frame and a deep
            // fade there washes out the one thing the photograph is of.
            maskImage: 'linear-gradient(to bottom, transparent 0%, #000 8%, #000 78%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, #000 8%, #000 78%, transparent 100%)',
          }}
        >
          <Image
            src={image}
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 64vw"
            // Graded in CSS rather than baked into the file, so the photograph stays the
            // photograph and the treatment stays adjustable. The source is a bright,
            // cool-lit office; on true black it needs the midtones pulled down and the
            // colour eased off before it sits in the page instead of glaring out of it.
            //
            // Much dimmer again on a phone, where the headline sits *over* the picture
            // rather than beside it — a face behind a headline is noise, not atmosphere.
            className="object-cover object-[70%_center] opacity-[0.38] brightness-[0.62] contrast-[1.12] saturate-[0.72] lg:opacity-100 lg:brightness-[0.78]"
          />
        </div>
      </div>

      {/* Screen glow. A single soft lime wash low in the frame, tying the photograph to
          the palette without touching the colour of anything in it. */}
      <div
        className="absolute bottom-0 right-0 h-[60%] w-[70%] opacity-[0.10]"
        style={{
          background:
            'radial-gradient(60% 60% at 70% 80%, var(--accent) 0%, transparent 70%)',
        }}
      />

      {/* Scrim. Heavier on small screens, where the headline sits over the photograph
          rather than beside it. */}
      <div className="absolute inset-0 bg-bg/72 lg:bg-bg/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  )
}
