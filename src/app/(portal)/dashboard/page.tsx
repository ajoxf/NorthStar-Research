import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, FileQuestion, Lock } from 'lucide-react'

import { TrialOffer } from '@/app/(portal)/trial-offer'
import { ReportCard, ReportRow } from '@/components/report-card'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember, memberHasAnyAccess, memberReportWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { trialOffers } from '@/lib/trial'
import { formatDate, fullName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Your reports' }
export const dynamic = 'force-dynamic'

/*
 * `sso` says a handoff to a product was refused and sent them here. Nothing on this site
 * links to a handover any more, so these are reached only by an old bookmark — which is
 * exactly when somebody lands somewhere unexpected and needs telling why.
 */
const SSO_NOTICE: Record<string, string> = {
  not_entitled:
    'That product could not be opened from here — this account does not hold an active subscription to it. What you do hold is below.',
  setting_up:
    'That access is still being set up. Try again shortly — if it persists, contact the desk.',
  unavailable:
    'That sign-in is temporarily unavailable. This is on our side, not yours; please try again shortly.',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { sso?: string }
}) {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/dashboard')

  const ssoNotice = searchParams?.sso ? SSO_NOTICE[searchParams.sso] : undefined
  const offer = await trialOffer(member.id)

  if (!(await memberHasAnyAccess(member)))
    return <InactiveState held={await heldItems(member.id)} notice={ssoNotice} offer={offer} />

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
      {/*
        Also on this path, not only the inactive one. A research member without a RAMP
        subscription reaches the ordinary dashboard, and without this their refused click
        would look like a dead button rather than an answer.
      */}
      {ssoNotice && (
        <p
          role="status"
          className="mb-8 rounded-lg border border-line bg-panel-2 px-4 py-3 text-[14px] leading-relaxed text-ink-dim"
        >
          {ssoNotice}
        </p>
      )}
      {offer.map((one) => (
        <TrialOffer key={one.itemSlug} days={one.days} itemName={one.itemName} itemSlug={one.itemSlug} />
      ))}
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

/*
 * Written for one sign-in, not two.
 *
 * These lines used to explain which password to use where, because the portal set the
 * product's password to match and the customer typed it twice. They no longer need to
 * know there are two systems at all — so the copy stops telling them.
 */
const SIGN_IN_NOTE: Record<HeldItem['signIn'], string> = {
  same: 'Opens straight from here — no second password.',
  existing: 'Opens straight from here — no second password.',
  pending:
    'One-click sign-in is still being set up. Until it is, open it directly and sign in with your own password there.',
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
/**
 * Is there a trial this member could start right now?
 *
 * Null unless trials are open, the item exists, and they have never held it — judged on
 * ever rather than currently, so a lapsed trial does not reappear as a fresh offer every
 * time they load the page.
 */
async function trialOffer(
  memberId: string,
): Promise<{ days: number; itemName: string; itemSlug: string }[]> {
  const open = await trialOffers()
  if (open.length === 0) return []

  /*
   * Everything they have not already had, not the first thing on the list.
   *
   * The offers are independent — a member may run a trial of every product at once — so
   * showing one of several would quietly hide the rest. "Ever held" is the filter, so a
   * trial that has already expired does not come back as a fresh offer next month.
   */
  const items = await db.item.findMany({
    where: { slug: { in: open.map((offer) => offer.slug) } },
    select: { id: true, slug: true },
  })
  const held = await db.entitlement.findMany({
    where: { memberId, itemId: { in: items.map((item) => item.id) } },
    select: { itemId: true },
  })
  const heldIds = new Set(held.map((row) => row.itemId))
  const heldSlugs = new Set(
    items.filter((item) => heldIds.has(item.id)).map((item) => item.slug),
  )

  return open
    .filter((offer) => !heldSlugs.has(offer.slug))
    .map((offer) => ({ days: offer.days, itemName: offer.name, itemSlug: offer.slug }))
}

function InactiveState({
  held = [],
  notice,
  offer,
}: {
  held?: HeldItem[]
  notice?: string
  offer?: { days: number; itemName: string; itemSlug: string }[]
}) {
  const offerBlock = offer && offer.length > 0 ? (
    <div className="mb-6 flex flex-col gap-3 text-left">
      {offer.map((one) => (
        <TrialOffer key={one.itemSlug} days={one.days} itemName={one.itemName} itemSlug={one.itemSlug} />
      ))}
    </div>
  ) : null

  const banner = notice ? (
    <p
      role="status"
      className="mb-6 rounded-lg border border-line bg-panel-2 px-4 py-3 text-left text-[14px] leading-relaxed text-ink-dim"
    >
      {notice}
    </p>
  ) : null

  if (held.length > 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        {banner}
        {offerBlock}
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
              {/*
                Through the handoff when there is one, and to the product's own sign-in
                when there is not.
                The handoff carries their portal session across so they arrive already in.
                But when the product account has not been created yet — the keys were
                unset when they were granted, or the product's auth system refused — the
                link used to disappear entirely, leaving somebody who holds a live
                entitlement staring at "we are still setting up your access" with no way
                in and nothing to do. The product's own sign-in still works, so offer it:
                a door needing a password beats no door.
              */}
              {item.url &&
                (item.signIn === 'pending' ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[13px] text-accent underline underline-offset-4"
                  >
                    Open {item.name} directly
                  </a>
                ) : (
                  <a
                    href="/api/sso/ramp"
                    className="mt-2 inline-block text-[13px] text-accent underline underline-offset-4"
                  >
                    Open {item.name}
                  </a>
                ))}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[15px] leading-relaxed text-ink-dim">
          This page is the research desk's reports, which are a separate subscription.
        </p>
        {/*
          Their own account, not the public enquiry form. "View membership" used to send a
          signed-in member to /join — a page that asks a stranger for their name and phone
          number so the desk can quote them. Somebody who is already signed in and holds a
          product reads that as having been logged out.
        */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/account" variant="secondary">
            Your account
          </ButtonLink>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      {banner}
      {offerBlock}
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
        <ButtonLink href="/account" variant="secondary">
          Your account
        </ButtonLink>
      </div>
    </div>
  )
}
