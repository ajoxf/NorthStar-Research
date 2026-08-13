import Link from 'next/link'

import { DisclaimerText } from '@/components/disclaimer'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember } from '@/lib/auth'

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-baseline gap-2">
      <span className="font-serif text-[19px] tracking-tight text-ink">NorthStar</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold transition-colors group-hover:text-ink">
        Research
      </span>
    </Link>
  )
}

export async function SiteHeader() {
  const member = await getCurrentMember()

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Wordmark />

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#reports"
            className="hidden px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink sm:block"
          >
            Reports
          </Link>
          <Link
            href="/#format"
            className="hidden px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink sm:block"
          >
            Format
          </Link>
          <Link
            href="/faqs"
            className="hidden px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink sm:block"
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
                className="px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <ButtonLink href="/join" size="sm">
                Join — $249
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
            <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
              Three research reports every week, covering commodities, international markets and
              indices, and option, crypto and spread opportunities.
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
            © {new Date().getFullYear()} NorthStar Research
          </p>
        </div>
      </div>
    </footer>
  )
}
