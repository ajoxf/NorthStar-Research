import type { Metadata } from 'next'

import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Checkout cancelled' }

export default function CheckoutCancelledPage() {
  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <h1 className="text-3xl text-ink">Checkout cancelled</h1>
      <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
        No payment was taken and nothing was charged. You can start again whenever you are ready.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/join" size="lg">
          Back to membership
        </ButtonLink>
        <ButtonLink href="/" size="lg" variant="secondary">
          Return home
        </ButtonLink>
      </div>
    </div>
  )
}
