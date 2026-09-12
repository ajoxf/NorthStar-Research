import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, FileQuestion, Lock } from 'lucide-react'

import { ReportCard, ReportRow } from '@/components/report-card'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember, memberHasAnyAccess, memberReportWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatDate, fullName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Your reports' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/dashboard')

  if (!(await memberHasAnyAccess(member))) return <InactiveState held={await heldItems(member.id)} />

  /*
   * What this member may read. Empty for an all-access member, so their two queries
   * below are exactly the queries they were before sections existed.
   */
  const visible = await memberReportWhere(member)

  /*
   * The most recent editions, full stop — not one per type.
   *
   * This used to run a query per report type and show the newest of each. That only made
   * sense while every report carried one of four fixed types; now that the desk numbers
   * its own editions and uploads carry no type, a per-type query would return nothing for
   * new reports and leave this section frozen on the last typed edition of each category
   * forever, however much was published after.
   */
  const current = await db.report.findMany({
    where: { published: true, ...visible },
    orderBy: { publishDate: 'desc' },
    take: 4,
    select: { id: true, type: true, title: true, summary: true, publishDate: true },
  })

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
    where: { published: true, ...visible, id: { notIn: current.map((r) => r.id) } },
    orderBy: { publishDate: 'desc' },
    take: 8,
    select: { id: true, type: true, title: true, summary: true, publishDate: true },
  })

  const name = fullName(member).split(' ')[0]

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-10">
        {/*
          "Latest", not "This week". The query below takes the four most recent editions
          whenever they were published — so in a quiet week this heading would have sat
          above reports from a fortnight ago and called them this week's.
        */}
        <span className="eyebrow">Latest</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">
          {name ? `Welcome back, ${name}.` : 'Welcome back.'}
        </h1>
        <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-ink-dim">
          The latest editions. Everything published before is in the archive.
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
              /*
                No index. It used to number the cards 1–4 by the report's position in the
                type list, which was only ever a restatement of the category — and with
                types gone it would number them by recency, implying an ordering the desk
                never assigned.
              */
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
      <h2 className="font-display text-xl text-ink">No reports published yet</h2>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-dim">
        Your membership is active. The next edition will appear here the moment it is published,
        and we will email you a link.
      </p>
      <ButtonLink href="/account" variant="secondary" size="md" className="mt-7">
        Account settings
      </ButtonLink>
    </div>
  )
}

type HeldItem = {
  name: string
  url: string | null
  endsAt: Date | null
  /** `same` — the credentials they just chose. `existing` — the ones they already had
   *  in that product. `pending` — no account there yet, which is a configuration
   *  problem on our side rather than anything they can fix. */
  signIn: 'same' | 'existing' | 'pending'
}

const SIGN_IN_NOTE: Record<HeldItem['signIn'], string> = {
  same: 'Sign in there with this email address and the password you set here.',
  existing: 'You already had an account — sign in there with the password you set in it, not this one.',
  pending: 'We are still setting up your sign-in. Contact the desk if it is not ready shortly.',
}

/**
 * The products this member holds a live entitlement to.
 *
 * Only consulted on the inactive path, so a research member's dashboard runs the same
 * queries it always has. Sections are excluded: those are research access, and if this
 * member held a live one they would not be on this path at all.
 */
async function heldItems(memberId: string): Promise<HeldItem[]> {
  const rows = await db.entitlement.findMany({
    where: { memberId, status: 'active', itemId: { not: null }, item: { kind: 'product' } },
    select: {
      renewsAt: true,
      item: {
        select: {
          name: true,
          url: true,
          // Their account in the product, if the portal has managed to open one. Its
          // absence and its origin change what we can honestly tell them about signing in.
          accounts: { where: { memberId }, select: { adoptedAt: true, disabledAt: true } },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  const now = Date.now()
  return rows
    .filter((row) => row.item && (!row.renewsAt || row.renewsAt.getTime() > now))
    .map((row) => {
      const account = row.item!.accounts[0] ?? null
      return {
        name: row.item!.name,
        url: row.item!.url,
        endsAt: row.renewsAt,
        signIn: !account || account.disabledAt ? 'pending' : account.adoptedAt ? 'existing' : 'same',
      }
    })
}

/**
 * What somebody sees when they have no research access.
 *
 * Two quite different people land here. Someone whose membership lapsed, who needs the
 * code they were emailed — the original case. And, since free trials, someone who signed
 * up for a product five seconds ago and has never had a membership to lapse: telling them
 * their membership is not active would be technically true and read as a failed signup.
 * So what they hold is stated first, and the research offer follows as an offer.
 */
function InactiveState({ held = [] }: { held?: HeldItem[] }) {
  if (held.length > 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel">
          <Check className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <h1 className="text-3xl text-ink">You're all set</h1>
        <ul className="mt-6 flex flex-col gap-2">
          {held.map((item) => (
            <li key={item.name} className="rounded-lg border border-line bg-panel px-4 py-3 text-left">
              <span className="text-[15px] text-ink">{item.name}</span>
              <span className="mt-0.5 block text-[13px] text-ink-dim">
                {item.endsAt ? `Runs until ${formatDate(item.endsAt)}` : 'No end date'}
              </span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-dim">
                {SIGN_IN_NOTE[item.signIn]}
              </span>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-[13px] text-accent underline underline-offset-4"
                >
                  Open {item.name}
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[15px] leading-relaxed text-ink-dim">
          This page is the research desk's reports, which are a separate subscription.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/join" variant="secondary">
            View membership
          </ButtonLink>
        </div>
      </div>
    )
  }

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
