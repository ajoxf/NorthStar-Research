import type { Metadata } from 'next'

import { CartView } from '@/app/(marketing)/cart/cart-view'
import { ToastProvider } from '@/components/ui/toast'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default function CartPage() {
  return (
    <ToastProvider>
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
        <span className="eyebrow">Checkout</span>
        <h1 className="mt-3 text-4xl text-ink">Your cart</h1>
        {/* Which providers each buyer is offered is asked per currency and country; see CartView. */}
        <CartView />
      </div>
    </ToastProvider>
  )
}
