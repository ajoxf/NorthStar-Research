import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileQuestion, Lock } from 'lucide-react'

import { ReportCard, ReportRow } from '@/components/report-card'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember, hasActiveSubscription } from '@/lib/auth'
import { db } from '@/lib/db'
import { REPORT_TYPES } from '@/lib/report-content'
import { fullName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Your reports' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login')

  if (!hasActiveSubscription(member)) return <InactiveState />

  // Latest published report of each of the three types, plus a short recent archive.
  const latest = await Promise.all(
    REPORT_TYPES.map((type) =>
      db.report.findFirst({
        where: { type: type.value, published: true },
        orderBy: { publishDate: 'desc' },
        select: { id: true, type: true, title: true, summary: true, publishDate: true },
      }),
    ),
  )
  const current = latest.filter((report): report is NonNullable<typeof report> => report !== null)

  const viewedIds = current.length
    ? new Set(
        (
          await db.reportView.findMany({
            where: { memberId: member.id, reportId: { in: current.map((r) => r.id) } },
            select: { reportId: true },
            distinct: ['reportId'],
          })
        ).map((view) => view.reportId),
      )
    : new Set<string>()

  const recent = await db.report.findMany({
    where: { published: true, id: { notIn: current.map((r) => r.id) } },
    orderBy: { publishDate: 'desc' },
    take: 8,
    select: { id: true, type: true, title: true, summary: true, publishDate: true },
  })

  const name = fullName(member).split(' ')[0]

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-10">
        <span className="eyebrow">This week</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">
          {name ? `Welcome back, ${name}.` : 'Welcome back.'}
        </h1>
        <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-ink-dim">
          The latest edition of all four reports. Everything published before is in the archive.
        </p>
      </div>

      {current.length === 0 ? (
        <EmptyReports />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {current.map((report) => (
            <ReportCard
              key={report.id}
              report={{ ...report, viewed: viewedIds.has(report.id) }}
              index={REPORT_TYPES.findIndex((type) => type.value === report.type)}
            />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-16">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-2xl text-ink">Recently published</h2>
            <Link href="/archive" className="text-[14px] text-accent underline underline-offset-4">
              Browse the full archive
            </Link>
          </div>

          <div className="border-t border-line">
            {recent.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EmptyReports() {
  return (
    <div className="panel flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel-2">
        <FileQuestion className="h-5 w-5 text-ink-dim" aria-hidden />
      </div>
      <h2 className="font-serif text-xl text-ink">No reports published yet</h2>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-dim">
        Your membership is active. The next edition will appear here the moment it is published, and
        we will email you a link — plus WhatsApp, if you have opted in.
      </p>
      <ButtonLink href="/account" variant="secondary" size="md" className="mt-7">
        Set your delivery preferences
      </ButtonLink>
    </div>
  )
}

function InactiveState() {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel">
        <Lock className="h-5 w-5 text-ink-dim" aria-hidden />
      </div>
      <h1 className="text-3xl text-ink">Your membership is not active</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
        Reports are available to active members only. If you have just paid, redeem the access code
        we emailed you. If you believe this is a mistake, contact support.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/redeem">Redeem a code</ButtonLink>
        <ButtonLink href="/join" variant="secondary">
          View membership
        </ButtonLink>
      </div>
    </div>
  )
}
