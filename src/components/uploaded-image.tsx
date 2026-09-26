import Image from 'next/image'

import { cn } from '@/lib/utils'

/** Vercel Blob's public hostname. Every store lives on a subdomain of it. */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

/**
 * Is this one of our own uploads, and therefore safe to put through the optimiser?
 *
 * The check is the hostname and nothing else. `next.config.mjs` allows exactly this host,
 * so anything else would be refused at render time with an error rather than a picture —
 * which is why the component falls back rather than trying and hoping.
 */
export function isOptimisable(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith(BLOB_HOST_SUFFIX)
  } catch {
    // A relative path, or something that is not a URL at all. Either way, not ours.
    return false
  }
}

/**
 * A picture somebody uploaded, drawn at the size it is actually shown.
 *
 * **The problem this exists for.** Every image on the site was a plain `<img>` pointed at
 * the full-size upload. A 1390px photograph was downloaded whole and squeezed into a
 * 330px card by the browser in one pass, and a one-shot downscale of that ratio aliases:
 * fine detail lands between output pixels and comes out crawling and blocky. It shows on
 * high-contrast type first, which is why title cards with words burnt into them looked
 * pixelated while plain photographs beside them looked fine. The uploads were never the
 * problem.
 *
 * `next/image` fixes it by resampling server-side to a width near the one being drawn,
 * including a 2× variant for dense screens, and serving WebP or AVIF. `sizes` is what
 * tells it which width to make, so a wrong `sizes` gives back the original fault — it is
 * required here rather than defaulted for that reason.
 *
 * **Why the fallback exists.** The uploaders accept a pasted URL on any host, deliberately:
 * a deployment with no Blob store configured can still set a picture. Those cannot go
 * through the optimiser — `remotePatterns` refuses them, and widening it to everything
 * would turn this deployment into an open image proxy for anyone who can guess the route.
 * They keep the plain `<img>`, which is what the whole site did until now.
 */
export function UploadedImage({
  src,
  alt = '',
  sizes,
  className,
  priority = false,
}: {
  src: string
  alt?: string
  /**
   * The CSS width this will be drawn at, per breakpoint. Getting it wrong is the one way
   * to reintroduce the fault, so it has no default.
   */
  sizes: string
  /** Applied to the image itself. The caller owns the frame and the cropping. */
  className?: string
  /** Set on an image above the fold, so it is not lazy-loaded into a visible gap. */
  priority?: boolean
}) {
  if (!isOptimisable(src)) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary host, which the
         optimiser is deliberately not opened up to. See the note above. */
      <img src={src} alt={alt} className={cn(className)} loading={priority ? 'eager' : 'lazy'} />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      // Filled to the frame the caller has already sized and clipped. The alternative is
      // passing intrinsic dimensions this component cannot know for an arbitrary upload.
      fill
      sizes={sizes}
      /*
       * Above Next's default of 75.
       *
       * These are not ordinary photographs: the title cards have wording burnt into them,
       * and lettering is where JPEG-style artefacts show first — ringing along the edges
       * of glyphs, which reads as exactly the "pixelated" fault this change is fixing. 75
       * is a sensible default for a photograph and slightly mean for type over one.
       */
      quality={85}
      className={cn(className)}
      priority={priority}
    />
  )
}
