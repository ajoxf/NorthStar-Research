import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'
import { db } from '@/lib/db'
import { fillPayUrl, paymentReference } from '@/lib/payments/gateways/custom'
import { toMajorString } from '@/lib/payments/money'
import { resolveGateway } from '@/lib/payments/registry'

export const metadata: Metadata = { title: 'Complete your payment', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Where a buyer who chose a payment-link provider lands: what they owe, the reference to
 * quote, the provider's instructions, and a button opening the provider's payment page with
 * the amount and reference filled in.
 *
 * Nothing here confirms a payment. "I've paid" only says so to the buyer; the order is
 * confirmed by the provider's signed webhook, or by an admin once the money has arrived.
 * The order id in the URL is the only key — unguessable, and the page shows nothing about
 * the buyer beyond what they bought.
 */
export default async function PayPage({ params }: { params: { order: string } }) {
  const order = await db.checkoutOrder.findUnique({
    where: { id: params.order },
    select: {
      id: true,
      number: true,
      email: true,
      status: true,
      gateway: true,
      grossCents: true,
      currency: true,
      lines: { orderBy: { position: 'asc' }, select: { name: true } },
    },
  })
  if (!order?.gateway?.startsWith('custom-')) notFound()
  const gateway = await resolveGateway(order.gateway)
  if (!gateway?.custom) notFound()

  const amountMinor = order.grossCents ?? 0
  const amount = `${toMajorString(amountMinor, order.currency)} ${order.currency}`
  const reference = paymentReference(order.number)
  const payUrl = gateway.custom.payUrl
    ? fillPayUrl(gateway.custom.payUrl, {
        amountMinor,
        currency: order.currency,
        orderNumber: order.number,
        orderId: order.id,
        email: order.email,
      })
    : null

  if (order.status === 'paid') {
    return (
      <Shell>
        <h1 className="text-3xl text-ink">Payment confirmed</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-dim">
          Order {reference} is paid. Your access details are on their way by email.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <span className="eyebrow">Complete your payment</span>
      <h1 className="mt-3 text-3xl text-ink">Pay {amount}</h1>

      <dl className="mt-6 grid gap-4 rounded-lg border border-line bg-panel p-5 text-left sm:grid-cols-2">
        <div>
          <dt className="text-[13px] text-ink-dim">For</dt>
          <dd className="mt-1 text-[16px] text-ink">{order.lines.map((line) => line.name).join(', ') || 'Your order'}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-dim">Payment reference</dt>
          <dd className="mt-1 font-mono text-[18px] text-ink">{reference}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
        Quote <span className="font-mono text-ink">{reference}</span> with your payment so we can match it to your order.
      </p>

      {gateway.custom.instructions && (
        <div className="mt-6 whitespace-pre-line rounded-lg border border-line px-5 py-4 text-left text-[16px] leading-relaxed text-ink">
          {gateway.custom.instructions}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {payUrl && (
          <a
            href={payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-center text-[15px] font-semibold text-on-accent transition-all hover:bg-accent-hover"
          >
            Pay {amount} with {gateway.name}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
        <ButtonLink href={`/checkout/success?order=${order.id}&claimed=1`} size="lg" variant="secondary">
          I&rsquo;ve paid
        </ButtonLink>
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-ink-dim">
        Access is given once we have confirmed the payment arrived. You will get an email when it is.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-5">{children}</div>
}
