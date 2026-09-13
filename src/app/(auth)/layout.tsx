import { headers } from 'next/headers'
import Link from 'next/link'

import { NexusWordmark, Wordmark } from '@/components/site-chrome'
import { ToastProvider } from '@/components/ui/toast'
import { trialOfferFor, trialOffers } from '@/lib/trial'

/**
 * Which brand these pages wear.
 *
 * Only /trial can change, and only when the offer on it is for a piece of software.
 * Somebody who clicks "start a trial" on Nexus RAMP's own sign-in screen should not land
 * on a page dressed as a different company — the branding split is the point. Signing in
 * and redeeming a code are NordStar Pro's own doors and stay as they are.
 *
 * The pathname comes from the header the middleware sets, because a layout cannot read
 * the route it is wrapping any other way.
 */
async function brandForThisPage(): Promise<'nordstar' | 'nexus'> {
  const head = headers()
  if (head.get('x-pathname') !== '/trial') return 'nordstar'

  /*
   * Which offer is on screen decides the clothes. ?item names it; a bare /trial shows a
   * single open offer, and with several open shows a chooser listing all of them — which
   * belongs to no one product, so it wears the house brand.
   */
  const asked = new URLSearchParams(head.get('x-search') ?? '').get('item')?.trim()
  if (asked) {
    const offer = await trialOfferFor(asked)
    return offer ? offer.brand : 'nordstar'
  }

  const open = await trialOffers()
  return open.length === 1 ? open[0].brand : 'nordstar'
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await brandForThisPage()
  const nexus = brand === 'nexus'

  return (
    <ToastProvider>
      {/* Every colour on the page resolves through the tokens this attribute redefines,
          so the whole subtree re-skins without a single component being restyled. */}
      <div data-brand={brand} className="relative flex min-h-screen flex-col">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-30" aria-hidden />

        <header className="relative border-b border-line">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            {nexus ? <NexusWordmark /> : <Wordmark />}
            {nexus ? (
              <a
                href="https://nexus-funds.vercel.app/"
                className="text-sm text-ink-dim transition-colors hover:text-ink"
              >
                Back to Nexus RAMP
              </a>
            ) : (
              <Link href="/" className="text-sm text-ink-dim transition-colors hover:text-ink">
                Back to site
              </Link>
            )}
          </div>
        </header>

        <main className="relative flex flex-1 items-center justify-center px-5 py-14">{children}</main>

        <footer className="relative border-t border-line px-5 py-6 text-center">
          {/*
            The research disclaimer is wrong under a signup for a risk platform — it
            disclaims the wrong thing, which is worse than disclaiming nothing. Software
            gets the note that actually applies to it: RAMP reads the fills you give it
            and shows you your own numbers; it does not trade and it does not advise.
          */}
          {/* Full dim ink rather than 70% of it. At this size the faded version measured
              2.84:1 on the light brand and 4.37:1 on the dark one — both under the 4.5:1
              a body of text needs, and the lighter brand badly so. Dropping the fade
              puts them at 5.07:1 and 8.33:1. */}
          <p className="mx-auto max-w-2xl text-[11px] leading-relaxed text-ink-dim">
            {nexus ? (
              <>
                Nexus RAMP reports on positions you import. It does not place orders, and
                nothing it shows is financial advice. Always check figures against your
                broker statement.
              </>
            ) : (
              <>
                Research is for educational and informational purposes only and is not
                financial advice.{' '}
                <Link href="/disclaimer" className="underline underline-offset-4 hover:text-ink-dim">
                  Read the full disclaimer
                </Link>
                .
              </>
            )}
          </p>
        </footer>
      </div>
    </ToastProvider>
  )
}
