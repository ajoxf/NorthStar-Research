import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AccountForms } from '@/app/(portal)/account/account-forms'
import { Badge, statusTone } from '@/components/ui/badge'
import { daysUntilRenewal, getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Account' }
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/account')

  const daysLeft = daysUntilRenewal(member)

  const reportsRead = await db.reportView.findMany({
    where: { memberId: member.id },
    select: { reportId: true },
    distinct: ['reportId'],
  })

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <span className="eyebrow">Your account</span>
      <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Settings</h1>

      <section className="panel mt-8 p-6">
        <h2 className="eyebrow mb-5">Membership</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] text-ink-dim">Status</dt>
            <dd className="mt-1.5">
              <Badge tone={statusTone(member.subscriptionStatus)}>{member.subscriptionStatus}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Member since</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {formatDate(member.subscriptionStartedAt ?? member.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">
              {member.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}
            </dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {member.subscriptionRenewsAt ? formatDate(member.subscriptionRenewsAt) : '—'}
              {daysLeft !== null && daysLeft >= 0 && (
                <span className="ml-2 text-ink-dim">
                  ({daysLeft} {daysLeft === 1 ? 'day' : 'days'})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Billing</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {member.billingProvider === 'stripe'
                ? 'Card — renews automatically'
                : member.billingProvider === 'cregis'
                  ? 'Crypto — renew manually'
                  : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Email</dt>
            <dd className="mt-1.5 break-all font-mono text-[13px] text-ink">{member.email}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Reports read</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">{reportsRead.length}</dd>
          </div>
        </dl>
      </section>

      <AccountForms
        member={{
          billingProvider: member.billingProvider,
          cancelAtPeriodEnd: member.cancelAtPeriodEnd,
          firstName: member.firstName,
          lastName: member.lastName,
          phoneNumber: member.phoneNumber,
        }}
      />
    </div>
  )
}
