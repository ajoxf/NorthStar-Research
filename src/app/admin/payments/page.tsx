import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound, Settings, Tag } from 'lucide-react'

import { MarkPaid } from '@/app/admin/payments/mark-paid'

import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { paymentReference } from '@/lib/payments/gateways/custom'
import { everyGateway } from '@/lib/payments/registry'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Payments', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const TONE: Record<string, 'up' | 'accent' | 'down' | 'muted'> = {
  paid: 'up',
  pending: 'accent',
  failed: 'down',
  expired: 'muted',
}

const FILTERS = ['all', 'paid', 'pending', 'failed', 'expired'] as const

/**
 * Every checkout attempt, paid or not.
 *
 * This is the money view: the operator should be able to answer "did this person
 * actually pay?" without opening a database or the processor's own dashboard — and they
 * should see the failures, not only the successes, because a stuck `pending` row is
 * exactly the case that generates a support message.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  await requireAdmin()

  const status = FILTERS.includes(searchParams.status as never) ? searchParams.status : 'all'
  const where = status && status !== 'all' ? { status: status as never } : {}

  const [orders, paidOrders, pendingCount, failedCount, gateways] = await Promise.all([
    db.checkoutOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    // The amounts themselves, not a count times a price. Packages mean orders no longer
    // share one figure, and multiplying would have quietly reported the wrong total the
    // moment a second price existed.
    db.checkoutOrder.findMany({ where: { status: 'paid' }, select: { amount: true } }),
    db.checkoutOrder.count({ where: { status: 'pending' } }),
    db.checkoutOrder.count({ where: { status: 'failed' } }),
    everyGateway(),
  ])
  const names = new Map(gateways.map((gateway) => [gateway.id, gateway.name]))

  const paidCount = paidOrders.length
  const collected = paidOrders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0)

  const stats = [
    { label: 'Paid', value: String(paidCount) },
    {
      label: 'Collected',
      value: `$${collected.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    },
    { label: 'Awaiting payment', value: String(pendingCount) },
    { label: 'Failed', value: String(failedCount) },
  ]

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Money in</span>
          <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Payments</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/payments/providers"
            className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-2 font-mono text-[14px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Providers &amp; keys
          </Link>
          <Link
            href="/admin/payments/packages"
            className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-2 font-mono text-[14px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
          >
            <Tag className="h-3.5 w-3.5" aria-hidden />
            Packages
          </Link>
          <Link
            href="/admin/payments/settings"
            className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-2 font-mono text-[14px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden />
            Settings
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="panel p-5">
            <div className="eyebrow">{stat.label}</div>
            <div className="mt-2 font-mono text-2xl text-ink">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option}
            href={`/admin/payments?status=${option}`}
            className={`rounded-full border px-3 py-1 font-mono text-[14px] uppercase tracking-[0.1em] ${
              status === option
                ? 'border-accent/40 bg-accent/10 text-accent-ink'
                : 'border-line text-ink-dim hover:text-ink'
            }`}
          >
            {option}
          </Link>
        ))}
      </div>

      <div className="panel relative mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="eyebrow px-4 py-3">Ref</th>
              <th className="eyebrow px-4 py-3">Started</th>
              <th className="eyebrow px-4 py-3">Email</th>
              <th className="eyebrow px-4 py-3">Via</th>
              <th className="eyebrow px-4 py-3">Amount</th>
              <th className="eyebrow px-4 py-3">Status</th>
              <th className="eyebrow px-4 py-3">Paid</th>
              <th className="eyebrow px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[17px] text-ink-dim">
                  No checkout attempts yet.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[15px] text-ink-dim">
                    {paymentReference(order.number)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[16px] text-ink-dim">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-[16px] text-ink">{order.email}</td>
                  <td className="px-4 py-3 text-[16px] text-ink-dim">
                    {(order.gateway && names.get(order.gateway)) ?? (order.provider === 'cregis' ? 'Cregis' : order.provider === 'stripe' ? 'Stripe' : order.provider)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[16px] text-ink">
                    {order.amount} {order.currency}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[order.status] ?? 'muted'}>{order.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[16px] text-ink-dim">
                    {order.paidAt ? formatDate(order.paidAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.status === 'paid' && !order.isTest && (
                      <a href={`/api/invoices/${order.id}`} className="text-[15px] text-accent-ink underline underline-offset-4">
                        Invoice
                      </a>
                    )}
                    {(order.status === 'pending' || order.status === 'failed') && !order.isTest && Number(order.amount) > 0 && (
                      <MarkPaid
                        orderId={order.id}
                        reference={paymentReference(order.number)}
                        amount={`${order.amount} ${order.currency}`}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
        A row stays at <span className="text-ink">pending</span> until the provider confirms it.
        If somebody says they paid but their row is still pending, check the provider — or, for a
        bank transfer or payment link, your account — and use <span className="text-ink">Mark as paid</span>{' '}
        only once the money has arrived. It gives access and sends the receipt once, however often
        it is pressed.
      </p>
    </div>
  )
}
