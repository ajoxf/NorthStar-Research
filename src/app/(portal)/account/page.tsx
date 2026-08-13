import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AccountForms } from '@/app/(portal)/account/account-forms'
import { Badge, statusTone } from '@/components/ui/badge'
import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Account' }
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login')

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
          firstName: member.firstName,
          lastName: member.lastName,
          phoneNumber: member.phoneNumber,
          whatsappOptIn: member.whatsappOptIn,
          whatsappVerified: member.whatsappVerified,
        }}
      />
    </div>
  )
}
