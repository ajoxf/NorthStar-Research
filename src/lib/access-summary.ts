import 'server-only'

import { isAllAccess } from '@/lib/entitlements'
import { db } from '@/lib/db'
import type { Member } from '@prisma/client'

/**
 * Everything an account holds, in one list, for showing somebody where they stand.
 *
 * Not a gate. Nothing here decides what may be opened — `hasAnyAccess` and `canReadReport`
 * do that, and they answer narrower questions on purpose. This is the answer to "what have
 * I actually got", which until now a member could not find anywhere: the account page
 * showed one status column belonging to the research membership, so somebody holding a
 * live Nexus RAMP entitlement read "PENDING" and reasonably concluded they had nothing.
 *
 * ## What it deliberately does not claim
 *
 * It never says "trial". A trial writes an ordinary entitlement with an end date and no
 * billing attached, which is indistinguishable from a comp granted by hand — so calling
 * one a trial would be a guess shown to the customer as a fact. What is stated instead is
 * true either way: what it grants, when it ends, and whether anything will be charged.
 */
export type AccessLine = {
  name: string
  /** 'research' reads the desk's writing; 'product' is a piece of software. */
  kind: 'research' | 'product'
  /** What it covers, in the member's words rather than ours. */
  detail: string
  /** Null means open-ended — a comp, or an all-access membership with no renewal date. */
  endsAt: Date | null
  /** Null when nothing is attached: granted rather than bought. */
  billing: 'stripe' | 'cregis' | null
  /**
   * Where to send somebody who wants to open this, or null for research, which is read
   * here. Prefers the handover route over the product's own address so they arrive signed
   * in rather than at a second password box.
   */
  openHref: string | null
}

/**
 * Products that have a handover route, keyed by slug.
 *
 * A list rather than a rule, because a handover is a route somebody wrote: there is one
 * today and it is Nexus RAMP's. A product missing from here still gets a link — to its own
 * front door, where it will ask for a password — which is worse but honest. Assuming every
 * product has a handover would send people to a 404.
 */
const HANDOVER: Record<string, string> = { 'nexus-ramp': '/api/sso/ramp' }

export async function accessSummary(
  member: Pick<Member, 'id' | 'role' | 'subscriptionStatus' | 'subscriptionRenewsAt' | 'billingProvider'>,
  now: Date = new Date(),
): Promise<AccessLine[]> {
  const lines: AccessLine[] = []

  /*
   * The legacy all-access membership first, where there is one. It is not an entitlement
   * row — it is two columns on Member — so it would be invisible in the query below, and
   * it is the thing most members on this site actually hold.
   */
  if (member.role !== 'admin' && isAllAccess(member, now)) {
    lines.push({
      name: 'NordStar Pro research',
      kind: 'research',
      detail: 'Every report and the full archive',
      endsAt: member.subscriptionRenewsAt,
      billing: member.billingProvider === 'stripe' || member.billingProvider === 'cregis'
        ? member.billingProvider
        : null,
      openHref: null,
    })
  }

  const rows = await db.entitlement.findMany({
    where: { memberId: member.id, status: 'active' },
    select: {
      renewsAt: true,
      billingProvider: true,
      sectionId: true,
      item: { select: { slug: true, name: true, kind: true, url: true } },
      section: {
        select: {
          displayName: true,
          topic: { select: { name: true } },
          author: { select: { name: true } },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  for (const row of rows) {
    // An end date in the past is not access, whatever the status column says. The nightly
    // job flips these, but a member whose period ended an hour ago must not be told they
    // still hold it because the job has not run yet.
    if (row.renewsAt && row.renewsAt.getTime() <= now.getTime()) continue

    const isSection = row.sectionId !== null || row.item?.kind === 'section'
    const sectionName =
      row.section?.displayName ??
      (row.section ? `${row.section.topic.name} by ${row.section.author.name}` : null)

    const name = sectionName ?? row.item?.name
    if (!name) continue

    lines.push({
      name,
      kind: isSection ? 'research' : 'product',
      detail: isSection
        ? 'Every report in this section, including back editions'
        : 'Opens with your NordStar Pro sign-in',
      endsAt: row.renewsAt,
      billing:
        row.billingProvider === 'stripe' || row.billingProvider === 'cregis'
          ? row.billingProvider
          : null,
      openHref: isSection
        ? null
        : ((row.item && HANDOVER[row.item.slug]) ?? row.item?.url ?? null),
    })
  }

  return lines
}
