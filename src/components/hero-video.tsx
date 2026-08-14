'use client'

import * as React from 'react'

/**
 * Hero background video.
 *
 * Poster-first by design: the still renders immediately and the video only fades in
 * once it can actually play, so the hero is never a black rectangle waiting on a large
 * file. If no video is configured, or the viewer prefers reduced motion, or the file
 * fails to load, the poster simply stays — the section is finished-looking either way.
 *
 * Institutional rather than retail: the footage sits at low opacity behind a heavy
 * gradient scrim, desaturated, with no controls, no sound and no fast cuts. It is
 * atmosphere behind the headline, not a showreel. Text contrast is the priority, which
 * is why the scrim is opaque enough to read against regardless of the frame beneath it.
 */
export function HeroVideo({ src, poster }: { src?: string; poster?: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [ready, setReady] = React.useState(false)

  // Motion preference is read at runtime, not from a media query in CSS, because we
  // need to skip the download entirely — not just hide a video that already loaded.
  const [allowMotion, setAllowMotion] = React.useState(false)
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setAllowMotion(!query.matches)

    const onChange = (event: MediaQueryListEvent) => setAllowMotion(!event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const showVideo = Boolean(src) && allowMotion

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {poster && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${poster})` }}
        />
      )}

      {showVideo && (
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          // `metadata` on the initial request keeps the hero from blocking on a large
          // file; the browser fetches the rest as it plays.
          preload="metadata"
          onCanPlay={() => setReady(true)}
          onError={() => setReady(false)}
        />
      )}

      {/* Scrim. Two stacked gradients: one flattens the footage so headline text stays
          legible over any frame, the other fades the base into the page below. */}
      <div className="absolute inset-0 bg-bg/70" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/40" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  )
}
