import type { Metadata } from 'next'
import type { Member } from '@prisma/client'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, FileQuestion, Lock, Users } from 'lucide-react'

import { TrialOffer } from '@/app/(portal)/trial-offer'
import { ExpertCard } from '@/components/expert-card'
import { ReportCard, ReportRow } from '@/components/report-card'
import { memberExperts } from '@/lib/member-experts'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember, memberHasAnyAccess, memberReportWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { trialOffers } from '@/lib/trial'
import { RESEARCH_TRIAL_SLUG, researchTrialRefusal } from '@/lib/research-trial'
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
  const offer = await trialOffer(member)

  if (!(await memberHasAnyAccess(member)))
    return (
      <InactiveState
        held={await heldItems(member.id)}
        notice={ssoNotice}
        offer={offer}
        /*
         * Has this account ever had research access?
         *
         * The difference between the two people who land here. Somebody who signed up for
         * a product five seconds ago has never had a membership and is genuinely all set.
         * Somebody whose membership has lapsed is not, whatever else they hold — and
         * telling them they are is how a lapse goes unnoticed until they come looking for
         * a report that is no longer there.
         */
        lapsed={member.subscriptionStartedAt !== null}
      />
    )

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
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      publishDate: true,
      // Who wrote it, for the label above the title. One join rather than a second query
      // per card — see the note in components/report-card.
      section: { select: { author: { select: { name: true } } } },
    },
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
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      publishDate: true,
      // Who wrote it, for the label above the title. One join rather than a second query
      // per card — see the note in components/report-card.
      section: { select: { author: { select: { name: true } } } },
    },
  })

  /*
   * Whose work this member can open. Derived from the reports themselves rather than from
   * a second reading of their subscription — see lib/member-experts.
   */
  const experts = await memberExperts(member)

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
              report={{
                ...report,
                viewed: viewedIds.has(report.id),
                authorName: report.section?.author.name ?? null,
              }}
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

      {/*
        Who the member actually subscribes to, as a way in.

        Placed under the latest editions rather than above them, because somebody opening
        the portal is usually here for what just landed. This is the second question —
        "show me everything from Dean" — and it is the one the archive could not answer
        without knowing which names a member holds.

        Shown to anybody who holds one, not only to somebody who holds several.

        This used to require more than one, on the reasoning that a single card restates
        what the whole dashboard already is. That reasoning was wrong in the case that
        matters most: a site with one contributor is the normal early state, and the
        member who most needs to see what they are subscribed to is the one who has just
        subscribed. It also made the band vanish silently, which is indistinguishable from
        it being broken.

        Nothing is shown when there is nothing to show. An empty list means no report this
        member can read carries a section — see the note in lib/member-experts — and there
        is no expert to name, so there is no band rather than an empty one.
      */}
      {experts.length > 0 && (
        <section className="mt-16">
          {/*
            One row: what this is on the left, where it goes on the right.

            This was an eyebrow, a sentence-length heading and a line of explanation stacked
            above the grid — three lines of chrome introducing cards that already say what
            they are. The cards carry the meaning now they are at this size, so the header
            steps back to a label and the way out.
          */}
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-dim">
              <Users className="h-4 w-4" aria-hidden />
              Your subscriptions
            </h2>
            <Link
              href="/archive"
              className="shrink-0 text-[14px] text-ink-dim underline underline-offset-4 transition-colors hover:text-ink"
            >
              All reports
            </Link>
          </div>

          {/*
            The row is sized to how many there are.

            A fixed three-column grid left card-sized holes beside a member who holds one
            or two subscriptions, which reads as something failing to load rather than as
            the end of the list. The count is known here, so: three across from three up,
            two across for two, and a single card held to one card's width rather than
            stretched across a column it would be a 650px-tall banner in.
          */}
          <div
            className={`grid gap-4 ${
              experts.length === 1
                ? 'max-w-md'
                : experts.length === 2
                  ? 'sm:grid-cols-2'
                  : 'sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {experts.map((expert) => (
              <ExpertCard
                key={expert.id}
                href={`/archive?expert=${encodeURIComponent(expert.slug)}`}
                name={expert.name}
                photoUrl={expert.photoUrl}
                topics={expert.topics}
                meta={`${expert.reportCount} ${expert.reportCount === 1 ? 'report' : 'reports'}`}
              />
            ))}
          </div>
        </section>
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
              <ReportRow
                key={report.id}
                report={{ ...report, authorName: report.section?.author.name ?? null }}
              />
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
}

/*
 * One line, because there is one answer now.
 *
 * These used to branch on whether this site had managed to open an account in the product
 * for them — "opens straight from here, no second password" when it had. It no longer
 * opens accounts anywhere, so all three branches would be saying something untrue. A
 * product has its own sign-in and this says so plainly, which is the thing a person needs
 * to know before they click.
 */
const SIGN_IN_NOTE = 'Has its own sign-in. Use your account there.'

/**
 * The products this member holds a live entitlement to.
 *
 * Only consulted on the inactive path, so a research member's dashboard runs the same
 * queries it always has. Sections are excluded: those are research access, and if this
 * member held a live one they would not be on this path at all.
 */
async function heldItems(memberId: string): Promise<HeldItem[]> {
  const rows = await db.entitlement.findMany({
    /*
     * Archived products are left out.
     *
     * Archiving an item withdraws it from sale and does not revoke anybody's entitlement —
     * that is the rule everywhere else and it is not being changed here. But this screen
     * is not an access check: it is a list of things being offered to somebody to go and
     * use, under a heading saying they are all set, with a link to open each one. A
     * product this site has disconnected has nowhere to send them, so naming it here is
     * an invitation to a dead end.
     */
    where: {
      memberId,
      status: 'active',
      itemId: { not: null },
      item: { kind: 'product', archivedAt: null },
    },
    select: {
      renewsAt: true,
      item: { select: { name: true, url: true } },
    },
    orderBy: { startedAt: 'desc' },
  })

  const now = Date.now()
  return rows
    .filter((row) => row.item && (!row.renewsAt || row.renewsAt.getTime() > now))
    .map((row) => ({
      name: row.item!.name,
      url: row.item!.url,
      endsAt: row.renewsAt,
    }))
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
  member: Pick<Member, 'id' | 'subscriptionStatus' | 'researchTrialStartedAt'>,
): Promise<{ days: number; itemName: string; itemSlug: string }[]> {
  const memberId = member.id
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

  /*
   * The research trial is judged by its own rule, not by "have they held the item".
   *
   * It is not an item — it is two columns on Member — so the held-items filter above can
   * never match it, and it was therefore offered to everybody, including the people
   * `researchTrialRefusal` exists to turn away. A member whose membership had lapsed was
   * shown "Try NordStar Pro research free for 21 days", clicked it, and was told "this
   * account already has a membership, sign in to read" — while signed in, and unable to
   * read. Every route off that screen ended somewhere that refused them.
   *
   * The refusal itself is right: somebody who has been a customer asking for a free
   * fortnight is asking for a discount on a renewal. Advertising it to them was the bug.
   */
  const researchRefused =
    researchTrialRefusal({
      enabled: true,
      subscriptionStatus: member.subscriptionStatus,
      researchTrialStartedAt: member.researchTrialStartedAt,
    }) !== null

  return open
    .filter((offer) => !heldSlugs.has(offer.slug))
    .filter((offer) => !(offer.slug === RESEARCH_TRIAL_SLUG && researchRefused))
    .map((offer) => ({ days: offer.days, itemName: offer.name, itemSlug: offer.slug }))
}

function InactiveState({
  held = [],
  notice,
  offer,
  lapsed = false,
}: {
  held?: HeldItem[]
  notice?: string
  offer?: { days: number; itemName: string; itemSlug: string }[]
  /** This account has had research access before, so being here is a lapse. */
  lapsed?: boolean
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
        {/*
          "You're all set" only when they are.

          This branch fires for anybody holding a product, and it used to greet them all
          the same way. But a member whose research subscription has lapsed is not all
          set — they are locked out of the thing they were paying for — and a tick and a
          congratulation is how a lapse goes unnoticed until they come looking for a
          report that is no longer there. The other person here, who signed up for a
          product five seconds ago and has never had a membership, genuinely is all set.
        */}
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel">
          {lapsed ? (
            <Lock className="h-5 w-5 text-ink-dim" aria-hidden />
          ) : (
            <Check className="h-5 w-5 text-accent" aria-hidden />
          )}
        </div>
        <h1 className="text-3xl text-ink">
          {lapsed ? 'Your membership has expired' : "You're all set"}
        </h1>
        {lapsed && (
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            Reports are available to active members only. Redeem the code from your renewal
            email to pick up where you left off. What you still hold is below.
          </p>
        )}
        <ul className="mt-6 flex flex-col gap-2">
          {held.map((item) => (
            <li key={item.name} className="rounded-lg border border-line bg-panel px-4 py-3 text-left">
              <span className="text-[15px] text-ink">{item.name}</span>
              <span className="mt-0.5 block text-[13px] text-ink-dim">
                {item.endsAt ? `Runs until ${formatDate(item.endsAt)}` : 'No end date'}
              </span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-dim">
                {SIGN_IN_NOTE}
              </span>
              {/*
                Their own front door, where it asks for a password.
                There was a handoff here that carried the portal session across, so
                somebody arrived already signed in. It is gone: a product sold here lives
                on its own domain with its own accounts and its own billing, and signing
                somebody into it from this site would be doing so on the strength of a
                subscription this site does not manage. One password box is the cost, and
                it is honest about which system they are entering.
              */}
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
        {!lapsed && (
          <p className="mt-6 text-[15px] leading-relaxed text-ink-dim">
            This page is the research desk's reports, which are a separate subscription.
          </p>
        )}
        {/*
          Somewhere to go, which this screen did not have.

          It offered "Your account" and nothing else. Somebody reading "the research is a
          separate subscription" and wanting that subscription had no way to get it from
          here: no price, no packages, no checkout — and the trial banner above, when it
          appeared at all, refused anybody who had ever been a member. Every route off
          this page ended somewhere that would not let them in.

          So the first button is the one that answers the sentence above it. A lapsed
          member is sent to the packages too rather than only to the code box: a code is
          what somebody who has *just paid* holds, and this person has not paid yet.
        */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/join">See packages</ButtonLink>
          <ButtonLink href="/redeem" variant="secondary">
            Redeem a code
          </ButtonLink>
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
        we emailed you. Otherwise the packages are below.
      </p>
      {/* Subscribing leads, redeeming follows. Only somebody who has already paid holds a
          code, and this screen is reached far more often by somebody who has not. */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/join">See packages</ButtonLink>
        <ButtonLink href="/redeem" variant="secondary">
          Redeem a code
        </ButtonLink>
        <ButtonLink href="/account" variant="secondary">
          Your account
        </ButtonLink>
      </div>
    </div>
  )
}
