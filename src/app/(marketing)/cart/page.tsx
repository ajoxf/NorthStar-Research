import type { Metadata } from 'next'

import { CartView } from '@/app/(marketing)/cart/cart-view'
import { ToastProvider } from '@/components/ui/toast'
import { paymentAvailability } from '@/lib/payments'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CartPage() {
  // Which rails can take money right now, asked of each rail — the same answer /join uses.
  const available = await paymentAvailability()
  return (
    <ToastProvider>
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
        <span className="eyebrow">Checkout</span>
        <h1 className="mt-3 text-4xl text-ink">Your cart</h1>
        <CartView cardReady={available.stripe} cryptoReady={available.cregis} />
      </div>
    </ToastProvider>
  )
}
