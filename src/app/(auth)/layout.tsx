import Link from 'next/link'

import { Wordmark } from '@/components/site-chrome'
import { ToastProvider } from '@/components/ui/toast'

/**
 * The chrome around signing in, redeeming a code and starting a trial.
 *
 * One brand, because there is only one site now. These pages used to be able to re-dress
 * themselves as Nexus RAMP, which mattered while Nexus signups came through here; Nexus
 * has its own portal, its own sign-in and its own billing, so nothing arriving at these
 * doors belongs to anybody else.
 *
 * `data-brand` stays on the wrapper even with a single value: every colour on the page
 * resolves through the tokens that attribute selects, and removing it would unstyle the
 * subtree rather than simplify it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div data-brand="nordstar" className="relative flex min-h-screen flex-col">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-30" aria-hidden />

        <header className="relative border-b border-line">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Wordmark />
            <Link href="/" className="text-sm text-ink-dim transition-colors hover:text-ink">
              Back to site
            </Link>
          </div>
        </header>

        <main className="relative flex flex-1 items-center justify-center px-5 py-14">{children}</main>

        <footer className="relative border-t border-line px-5 py-6 text-center">
          {/* Full dim ink rather than 70% of it. At this size the faded version measured
              2.84:1, under the 4.5:1 a body of text needs. Dropping the fade puts it at
              5.07:1. */}
          <p className="mx-auto max-w-2xl text-[11px] leading-relaxed text-ink-dim">
            Research is for educational and informational purposes only and is not financial
            advice.{' '}
            <Link href="/disclaimer" className="underline underline-offset-4 hover:text-ink-dim">
              Read the full disclaimer
            </Link>
            .
          </p>
        </footer>
      </div>
    </ToastProvider>
  )
}
