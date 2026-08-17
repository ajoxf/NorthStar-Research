import Link from 'next/link'

import { DisclaimerText } from '@/components/disclaimer'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember } from '@/lib/auth'

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-baseline gap-2">
      {/* The brand is split across two spans so the two halves can be set differently.
          Any find-and-replace over "NordStar Pro" therefore misses this — the second
          span has to be edited by hand or the logo keeps reading the old name. */}
      <span className="font-display text-[19px] tracking-tight text-ink">NordStar</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent transition-colors group-hover:text-ink">
        Pro
      </span>
    </Link>
  )
}

export async function SiteHeader() {
  const member = await getCurrentMember()

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
        <Wordmark />

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/faqs"
            className="hidden px-3 py-2 text-sm text-ink-dim underline-offset-8 transition-colors hover:text-ink hover:underline hover:decoration-accent hover:decoration-2 sm:block"
          >
            FAQs
          </Link>

          {member ? (
            <ButtonLink href="/dashboard" size="sm" variant="secondary">
              My dashboard
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/login"
                className="whitespace-nowrap px-2.5 py-2 text-sm text-ink-dim transition-colors hover:text-ink sm:px-3"
              >
                Sign in
              </Link>
              {/* The price is the point of the button, but it is what makes it wide;
                  at phone width the label shortens rather than wrapping the header. */}
              <ButtonLink href="/join" size="sm" className="whitespace-nowrap">
                <span className="sm:hidden">Join</span>
                <span className="hidden sm:inline">Join — $199/mo</span>
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel-2">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="mb-10 flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-xs">
            <Wordmark />
            {/* The parent brand, stated once where it belongs, rather than crowding the
                header wordmark on every page. */}
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">
              by Fincoursa
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
              Three research reports every week, covering commodities, international markets and
              indices, options, crypto and spreads, and FX.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-12 gap-y-6 text-[14px]">
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Product</span>
              <Link href="/join" className="text-ink-dim hover:text-ink">
                Membership
              </Link>
              <Link href="/login" className="text-ink-dim hover:text-ink">
                Member sign-in
              </Link>
              <Link href="/redeem" className="text-ink-dim hover:text-ink">
                Redeem a code
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Legal</span>
              <Link href="/disclaimer" className="text-ink-dim hover:text-ink">
                Disclaimer
              </Link>
              <Link href="/privacy-policy" className="text-ink-dim hover:text-ink">
                Privacy Policy
              </Link>
              <Link href="/faqs" className="text-ink-dim hover:text-ink">
                FAQs
              </Link>
            </div>
          </nav>
        </div>

        {/* Requirement 15: the complete disclaimer appears site-wide, not just on its
            own page. Set small and dim, but present in full on every page. */}
        <div className="border-t border-line pt-8">
          <h2 className="eyebrow mb-4">Disclaimer</h2>
          <DisclaimerText className="space-y-3 text-[12px] leading-relaxed text-ink-dim/85" />
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim/60">
            © {new Date().getFullYear()} NordStar Pro
          </p>
        </div>
      </div>
    </footer>
  )
}
