import { EyeOff } from 'lucide-react'

/**
 * "You are seeing this because you are an admin."
 *
 * Sits at the top of a page that is live for you and 404 for everybody else. Stated
 * loudly rather than subtly: the failure it prevents is an operator showing this URL to
 * someone, or linking it in an email, on the reasonable assumption that a page they can
 * open is a page that exists.
 */
export function PreviewBanner() {
  return (
    <div className="border-b border-accent/30 bg-accent/[0.07]">
      <p className="mx-auto flex max-w-5xl items-start gap-2.5 px-5 py-3 text-[13px] leading-relaxed text-ink-dim">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>
          <strong className="font-medium text-ink">Preview — not visible to the public.</strong>{' '}
          You can see this because you are signed in as an admin. Everyone else gets a 404, and
          nothing on the site links here. Turn it on in{' '}
          <span className="font-mono text-[12px]">Admin → Sections</span>.
        </span>
      </p>
    </div>
  )
}
