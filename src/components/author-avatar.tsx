import { authorInitials } from '@/lib/section-shape'

/**
 * An author's photograph, or their initials when there is not one yet.
 *
 * A plain `<img>` rather than next/image on purpose: the URL is typed into the admin by
 * hand and can point anywhere, and next/image refuses hosts that are not in
 * `next.config` — which would turn "somebody pasted a photo URL" into a build-time
 * configuration change. The initials fallback means a missing or broken photograph still
 * renders as a designed element rather than as a torn-image icon.
 */
export function AuthorAvatar({
  name,
  photoUrl,
  size = 48,
}: {
  name: string
  photoUrl?: string | null
  size?: number
}) {
  const style = { width: size, height: size }

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        style={style}
        className="shrink-0 rounded-full border border-line object-cover"
        loading="lazy"
      />
    )
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.34) }}
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-panel-2 font-mono text-ink-dim"
    >
      {authorInitials(name)}
    </span>
  )
}
