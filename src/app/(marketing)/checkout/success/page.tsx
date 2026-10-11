import type { Metadata } from 'next'
import { CheckCircle2, Clock, MailCheck } from 'lucide-react'

import { SimulatePayment } from '@/app/(marketing)/checkout/success/simulate-payment'
import { ClearPaidCart } from '@/components/cart/clear-paid'
import { ButtonLink } from '@/components/ui/button'
import { db } from '@/lib/db'
import { applyGatewayEvents } from '@/lib/payments/apply'
import { sessionIdOf } from '@/lib/payments/session-ref'
import { paymentReference } from '@/lib/payments/gateways/custom'
import { testGateway, testPaymentsAllowed } from '@/lib/payments/gateways/test'
import { connectForConfirmation } from '@/lib/payments/registry'

export const metadata: Metadata = { title: 'Payment received' }
export const dynamic = 'force-dynamic'

type ReturnState = 'confirmed' | 'simulate' | 'claimed' | 'waiting' | null

/**
 * For an order from a provider on the Providers page: ask the provider whether it is paid,
 * rather than waiting for its webhook, so the buyer sees the answer now.
 *
 * Asking is safe where trusting the URL would not be: the provider is called with our own
 * keys, and what it says goes through the same idempotent path as its webhook. The order id
 * in the URL only chooses which order to ask about.
 */
async function settleOnReturn(orderId: string | undefined, claimed: boolean): Promise<{ state: ReturnState; reference: string | null }> {
  if (!orderId) return { state: null, reference: null }
  const order = await db.checkoutOrder.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, status: true, gateway: true, cregisOrderId: true },
  })
  if (!order?.gateway) return { state: null, reference: null }
  const reference = paymentReference(order.number)
  if (order.status === 'paid') return { state: 'confirmed', reference }

  if (order.gateway === testGateway.id && testPaymentsAllowed()) return { state: 'simulate', reference }

  const connected = await connectForConfirmation(order.gateway)
  if (order.status === 'pending' && connected?.gateway.verify && !connected.gateway.rail) {
    try {
      const events = await connected.gateway.verify(
        { orderId: order.id, sessionId: sessionIdOf(order.gateway, order.cregisOrderId) },
        connected.cfg,
      )
      await applyGatewayEvents(connected.gateway, events)
      const after = await db.checkoutOrder.findUnique({ where: { id: order.id }, select: { status: true } })
      if (after?.status === 'paid') return { state: 'confirmed', reference }
    } catch (error) {
      // The webhook will still arrive; the buyer is told to watch their inbox.
      console.error(`[payments:${order.gateway}] could not verify order ${order.id} on return`, error)
    }
  }
  if (claimed || order.gateway.startsWith('custom-')) return { state: 'claimed', reference }
  return { state: 'waiting', reference }
}

/**
 * Landing page after the payment processor redirects the browser back.
 *
 * Note carefully what this page does NOT do: it grants nothing. Reaching this URL is
 * not proof of payment — anyone can type it. The redemption code is minted only by the
 * verified server-to-server webhook (build spec §5, requirement 5), so this page can
 * only tell the buyer to watch their inbox.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string; order?: string; claimed?: string }
}) {
  const { state, reference } = await settleOnReturn(searchParams.order, searchParams.claimed === '1')

  if (state === 'confirmed' || state === 'simulate' || state === 'claimed') {
    const Icon = state === 'confirmed' ? CheckCircle2 : state === 'claimed' ? Clock : MailCheck
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        {state === 'confirmed' && <ClearPaidCart />}
        <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
          <Icon className="h-6 w-6 text-accent-ink" aria-hidden />
        </div>
        {state === 'confirmed' && (
          <>
            <h1 className="text-3xl text-ink">Order confirmed</h1>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
              Payment for order {reference} is confirmed. Your access is on its way by email — if you already have an
              account, it is in your account now.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/dashboard" size="lg">
                Go to my reports
              </ButtonLink>
              <ButtonLink href="/redeem" size="lg" variant="secondary">
                I have a code
              </ButtonLink>
            </div>
            {searchParams.order && (
              <p className="mt-6 text-[15px]">
                <a href={`/api/invoices/${searchParams.order}`} className="text-ink underline underline-offset-4">
                  View your tax invoice
                </a>
              </p>
            )}
          </>
        )}
        {state === 'claimed' && (
          <>
            <h1 className="text-3xl text-ink">Thank you — we&rsquo;ll confirm shortly</h1>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
              As soon as your payment for order {reference} reaches us we will confirm it and email you your access.
              There is nothing more to do.
            </p>
          </>
        )}
        {state === 'simulate' && searchParams.order && (
          <>
            <h1 className="text-3xl text-ink">Test payment</h1>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
              This is the test provider: no money moves. Simulate the payment to see what a buyer gets.
            </p>
            <SimulatePayment orderId={searchParams.order} />
          </>
        )}
      </div>
    )
  }

  /*
   * Card and crypto both land here, and they do not settle the same way.
   *
   * Stripe appends `session_id` to its return URL; Cregis does not. That one difference is
   * enough to stop telling a card buyer their payment is confirming "on-chain" and may be
   * held up by "network congestion" — which was the previous copy, shown to everybody, and
   * which reads as though a Visa payment were sitting in a mempool.
   */
  const paidByCard = Boolean(searchParams.session_id)

  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <ClearPaidCart />
      <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
        <MailCheck className="h-6 w-6 text-accent-ink" aria-hidden />
      </div>

      <h1 className="text-3xl text-ink">Thank you — check your email</h1>
      <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
        {paidByCard
          ? 'As soon as your payment confirms we will email your one-time access code to the ' +
            'address you gave at checkout. That is usually immediate, but it can take a minute ' +
            'or two to reach you.'
          : 'As soon as your payment confirms on-chain we will email your one-time access code ' +
            'to the address you gave at checkout. Confirmation usually takes a few minutes, ' +
            'occasionally longer during network congestion.'}
      </p>
      {/*
        What was bought, not "the full archive".
        
        This page is reached by anybody who has paid — including somebody who bought one
        subject from one expert. Promising them the whole archive here is a claim the
        portal then refuses the moment they sign in, which is the worst possible order in
        which to find that out.
      */}
      <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
        When it arrives, redeem it to create your account. You will have everything included
        in what you bought, back to its first edition.
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
