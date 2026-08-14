import type { Metadata } from 'next'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLAN } from '@/lib/env'
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

  const [orders, paidCount, pendingCount, failedCount] = await Promise.all([
    db.checkoutOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.checkoutOrder.count({ where: { status: 'paid' } }),
    db.checkoutOrder.count({ where: { status: 'pending' } }),
    db.checkoutOrder.count({ where: { status: 'failed' } }),
  ])

  const stats = [
    { label: 'Paid', value: String(paidCount) },
    { label: 'Collected', value: `$${(paidCount * PLAN.priceUsd).toLocaleString()}` },
    { label: 'Awaiting payment', value: String(pendingCount) },
    { label: 'Failed', value: String(failedCount) },
  ]

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <span className="eyebrow">Money in</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Payments</h1>
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
            className={`rounded-full border px-3 py-1 font-mono text-[12px] uppercase tracking-[0.1em] ${
              status === option
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line text-ink-dim hover:text-ink'
            }`}
          >
            {option}
          </Link>
        ))}
      </div>

      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="eyebrow px-4 py-3">Started</th>
              <th className="eyebrow px-4 py-3">Email</th>
              <th className="eyebrow px-4 py-3">Via</th>
              <th className="eyebrow px-4 py-3">Amount</th>
              <th className="eyebrow px-4 py-3">Status</th>
              <th className="eyebrow px-4 py-3">Paid</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[15px] text-ink-dim">
                  No checkout attempts yet.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-ink">{order.email}</td>
                  <td className="px-4 py-3 text-[14px] capitalize text-ink-dim">{order.provider}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[14px] text-ink">
                    {order.amount} {order.currency}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[order.status] ?? 'muted'}>{order.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">
                    {order.paidAt ? formatDate(order.paidAt) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        A row stays at <span className="text-ink">pending</span> until the processor confirms it.
        If somebody says they paid but their row is still pending, the money did not reach us —
        check the processor before granting access by hand from{' '}
        <Link href="/admin/codes" className="text-accent underline underline-offset-4">
          Codes
        </Link>
        .
      </p>
    </div>
  )
}
