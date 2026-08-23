import Link from 'next/link'
import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { AlertTriangle } from 'lucide-react'

import { EnquiryActions } from '@/app/admin/enquiries/enquiry-actions'
import { Badge } from '@/components/ui/badge'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { formatPrice } from '@/lib/package-shape'
import { defaultPackage } from '@/lib/packages'
import { pricingMode } from '@/lib/pricing-mode'
import { formatDateTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Enquiries', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const FILTERS = ['open', 'new', 'invited', 'converted', 'closed', 'all'] as const
type Filter = (typeof FILTERS)[number]

/**
 * People who asked what it costs.
 *
 * With the price off the public site this is the top of the funnel and the only record of
 * demand the product has, so it is a working queue rather than a log: every row can be
 * quoted, copied to WhatsApp, or set aside from where it sits.
 *
 * `open` is the default view — new and invited together — because those are the two
 * states that need something from a person. Converted and closed are still here, because
 * nothing is deleted, but they are not what you come to this screen to do.
 */
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  await requireAdmin()

  const filter: Filter = FILTERS.includes(searchParams.filter as Filter)
    ? (searchParams.filter as Filter)
    : 'open'

  const where: Prisma.PricingEnquiryWhereInput =
    filter === 'all'
      ? {}
      : filter === 'open'
        ? { status: { in: ['new', 'invited'] } }
        : { status: filter as 'new' | 'invited' | 'converted' | 'closed' }

  const [enquiries, counts, plan, mode] = await Promise.all([
    db.pricingEnquiry.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.pricingEnquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    defaultPackage(),
    pricingMode(),
  ])

  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Record<
    string,
    number
  >
  const open = (byStatus.new ?? 0) + (byStatus.invited ?? 0)
  const base = appBaseUrl()

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl px-5 py-10">
        <div className="mb-8">
          <span className="eyebrow">Demand</span>
          <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Enquiries</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
            People who asked what membership costs. Send them the figure and a payment link from
            here — the price comes from the default package,{' '}
            <span className="text-ink">{formatPrice(plan.priceCents, plan.currency)}</span> per{' '}
            {plan.interval}, so the email and the checkout cannot disagree.
          </p>
        </div>

        {mode === 'public' && (
          <p className="mb-6 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3.5 text-[13px] leading-relaxed text-ink-dim">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="font-medium text-ink">The price is currently public.</strong> The
              site shows it and sells directly, so new enquiries will be rare. Switch back to
              request-only under{' '}
              <Link
                href="/admin/payments/settings"
                className="text-accent underline underline-offset-4"
              >
                Payment settings
              </Link>
              .
            </span>
          </p>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {FILTERS.map((entry) => (
            <Link
              key={entry}
              href={entry === 'open' ? '/admin/enquiries' : `/admin/enquiries?filter=${entry}`}
              className={`rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors ${
                filter === entry
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-ink-dim hover:text-ink'
              }`}
            >
              {entry}{' '}
              {entry === 'open'
                ? open
                : entry === 'all'
                  ? Object.values(byStatus).reduce((sum, n) => sum + n, 0)
                  : (byStatus[entry] ?? 0)}
            </Link>
          ))}
        </div>

        {enquiries.length === 0 ? (
          <p className="rounded-lg border border-line bg-panel px-4 py-10 text-center text-[14px] leading-relaxed text-ink-dim">
            Nothing here yet. Requests from the join page land in this list.
          </p>
        ) : (
          <ul className="space-y-3">
            {enquiries.map((enquiry) => (
              <li key={enquiry.id} className="rounded-lg border border-line bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] text-ink">{enquiry.name}</span>
                      <Badge tone={toneFor(enquiry.status)}>{enquiry.status}</Badge>
                    </div>

                    <p className="mt-1 break-all font-mono text-[12px] text-ink-dim">
                      {enquiry.email}
                      {enquiry.phoneNumber && ` · ${enquiry.phoneNumber}`}
                      {enquiry.whatsappNumber && ` · WhatsApp ${enquiry.whatsappNumber}`}
                    </p>

                    {enquiry.note && (
                      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                        {enquiry.note}
                      </p>
                    )}

                    <p className="mt-2 font-mono text-[11px] text-ink-dim">
                      asked {formatDateTime(enquiry.createdAt)}
                      {enquiry.invitedAt && ` · quoted ${formatDateTime(enquiry.invitedAt)}`}
                      {enquiry.referralSlug && ` · via ${enquiry.referralSlug}`}
                    </p>
                  </div>
                </div>

                <EnquiryActions
                  id={enquiry.id}
                  name={enquiry.name}
                  status={enquiry.status}
                  joinUrl={`${base}/join?invite=${enquiry.inviteToken}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ToastProvider>
  )
}

function toneFor(status: string): 'up' | 'accent' | 'neutral' | 'muted' {
  if (status === 'converted') return 'up'
  if (status === 'new') return 'accent'
  if (status === 'closed') return 'muted'
  return 'neutral'
}
