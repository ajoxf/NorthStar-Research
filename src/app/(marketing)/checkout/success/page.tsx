import type { Metadata } from 'next'
import { MailCheck } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Payment received' }

/**
 * Landing page after the payment processor redirects the browser back.
 *
 * Note carefully what this page does NOT do: it grants nothing. Reaching this URL is
 * not proof of payment — anyone can type it. The redemption code is minted only by the
 * verified server-to-server webhook (build spec §5, requirement 5), so this page can
 * only tell the buyer to watch their inbox.
 */
export default function CheckoutSuccessPage() {
  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
        <MailCheck className="h-6 w-6 text-accent" aria-hidden />
      </div>

      <h1 className="text-3xl text-ink">Thank you — check your email</h1>
      <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
        As soon as your payment confirms on-chain we will email your one-time access code to the
        address you gave at checkout. Confirmation usually takes a few minutes, occasionally longer
        during network congestion.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
        When it arrives, redeem it to create your account and unlock this week&apos;s reports and the
        full archive.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/redeem" size="lg">
          I have my code
        </ButtonLink>
        <ButtonLink href="/faqs" size="lg" variant="secondary">
          Code not arrived?
        </ButtonLink>
      </div>
    </div>
  )
}
