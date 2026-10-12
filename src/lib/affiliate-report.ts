import 'server-only'

import { SUB_AFFILIATE_OVERRIDE_PERCENT } from '@/lib/commission-shape'
import { db } from '@/lib/db'
import {
  type DayPoint,
  dailySeries,
  maskEmail,
  maskName,
  periodStart,
  topCounts,
} from '@/lib/partner-report-shape'

/**
 * What an affiliate sees about the people and money their links brought in.
 *
 * Every figure here is scoped to the affiliate: a client's other purchases — ones that did
 * not come through this affiliate — are none of the affiliate's business and are never
 * counted. People are shown masked ("Sarah K.", "s•••@gmail.com"); the affiliate introduced
 * them, but they are the site's customers.
 */

/** What a buyer paid for an order, less tax, less what refunds gave back (net of tax too). */
function netCents(order: { amount: string; grossCents: number | null; taxCents: number | null; refunds: { amountCents: number }[] }): number {
  const gross = order.grossCents ?? Math.round(Number(order.amount) * 100)
  const tax = order.taxCents ?? 0
  const net = Math.max(0, gross - tax)
  const refunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  // A refund gives back tax in proportion, so only its net share comes off the net.
  const refundedNet = gross > 0 ? Math.round((refunded * net) / gross) : 0
  return Math.max(0, net - refundedNet)
}

const ORDER_SELECT = {
  id: true,
  number: true,
  email: true,
  amount: true,
  grossCents: true,
  taxCents: true,
  paidAt: true,
  createdAt: true,
  billingCountry: true,
  affiliateCampaign: true,
  refunds: { select: { amountCents: true } },
  lines: { select: { name: true, chargeCents: true }, orderBy: { position: 'asc' as const } },
} as const

/** The affiliate's paid orders, newest first. Operator live-mode probes are not sales. */
async function paidOrders(affiliateId: string, since?: Date) {
  return db.checkoutOrder.findMany({
    where: { affiliateId, status: 'paid', isTest: false, ...(since ? { paidAt: { gte: since } } : {}) },
    orderBy: { paidAt: 'desc' },
    select: ORDER_SELECT,
  })
}

/** Commission per order: the commission less any reversal a refund wrote against it. */
async function commissionByOrder(affiliateId: string, orderIds: string[]): Promise<Map<string, number>> {
  const byOrder = new Map<string, number>()
  if (orderIds.length === 0) return byOrder
  const entries = await db.ledgerEntry.findMany({
    where: {
      affiliateId,
      OR: [
        { kind: 'commission', orderId: { in: orderIds } },
        { kind: 'reversal', refund: { orderId: { in: orderIds } } },
      ],
    },
    select: { amountCents: true, orderId: true, refund: { select: { orderId: true } } },
  })
  for (const entry of entries) {
    const orderId = entry.orderId ?? entry.refund?.orderId
    if (orderId) byOrder.set(orderId, (byOrder.get(orderId) ?? 0) + entry.amountCents)
  }
  return byOrder
}

// ---------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------

export type AffiliateOverview = {
  clicks: number
  signups: number
  buyers: number
  sales: number
  revenueCents: number
  commissionCents: number
  series: { commission: DayPoint[]; clicks: DayPoint[]; signups: DayPoint[] }
  /** Clicks by referring site; null is a direct visit or a browser that sent no referrer. */
  sources: { key: string | null; count: number }[]
  /** Clicks by country; null is unknown. */
  countries: { key: string | null; count: number }[]
  /** What the referred buyers bought, by product name, with sales after tax and refunds. */
  products: { name: string; sales: number; revenueCents: number }[]
}

/**
 * Sales per product. An order's net is shared across its lines by what each was charged,
 * so a two-item cart does not count its whole amount against both.
 */
function productTotals(orders: { lines: { name: string; chargeCents: number }[]; amount: string; grossCents: number | null; taxCents: number | null; refunds: { amountCents: number }[] }[]) {
  const byName = new Map<string, { sales: number; revenueCents: number }>()
  for (const order of orders) {
    const net = netCents(order)
    const lines = order.lines.length > 0 ? order.lines : [{ name: 'Membership', chargeCents: 1 }]
    const weight = lines.reduce((sum, line) => sum + Math.max(0, line.chargeCents), 0)
    lines.forEach((line) => {
      const row = byName.get(line.name) ?? { sales: 0, revenueCents: 0 }
      row.sales += 1
      row.revenueCents += weight > 0 ? Math.round((net * Math.max(0, line.chargeCents)) / weight) : Math.round(net / lines.length)
      byName.set(line.name, row)
    })
  }
  return [...byName.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.sales - a.sales)
    .slice(0, 8)
}

/** The period's funnel and daily series. */
export async function affiliateOverview(affiliateId: string, days: number, now: Date = new Date()): Promise<AffiliateOverview> {
  const since = periodStart(days, now)
  const [clickRows, signupRows, orders, commissions] = await Promise.all([
    // Every referral row began as a click: a sign-up takes over the click that led to it
    // rather than adding a row, so counting rows counts clicks — as the page always has.
    db.referral.findMany({ where: { affiliateId, visitedAt: { gte: since } }, select: { visitedAt: true, referrerHost: true, country: true } }),
    db.referral.findMany({ where: { affiliateId, signedUpAt: { gte: since } }, select: { signedUpAt: true } }),
    paidOrders(affiliateId, since),
    db.ledgerEntry.findMany({
      where: { affiliateId, kind: { in: ['commission', 'override', 'reversal'] }, createdAt: { gte: since } },
      select: { amountCents: true, createdAt: true },
    }),
  ])
  return {
    clicks: clickRows.length,
    signups: signupRows.length,
    buyers: new Set(orders.map((order) => order.email.toLowerCase())).size,
    sales: orders.length,
    revenueCents: orders.reduce((sum, order) => sum + netCents(order), 0),
    commissionCents: commissions.reduce((sum, entry) => sum + entry.amountCents, 0),
    series: {
      commission: dailySeries(commissions.map((entry) => ({ at: entry.createdAt, value: entry.amountCents })), days, now),
      clicks: dailySeries(clickRows.map((row) => ({ at: row.visitedAt })), days, now),
      signups: dailySeries(signupRows.flatMap((row) => (row.signedUpAt ? [{ at: row.signedUpAt }] : [])), days, now),
    },
    sources: topCounts(clickRows.map((row) => row.referrerHost), 6).map((row) => ({ key: row.key, count: row.count })),
    countries: topCounts(clickRows.map((row) => row.country), 6).map((row) => ({ key: row.key, count: row.count })),
    products: productTotals(orders),
  }
}

// ---------------------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------------------

export type AffiliateClient = {
  key: string
  name: string
  email: string
  joinedAt: Date
  how: 'link' | 'bought'
  country: string | null
  orders: number
  revenueCents: number
  commissionCents: number
  /** Whether they hold a live subscription now — a client who lapsed is worth a nudge. */
  subscribed: boolean
  lastActiveAt: Date | null
  campaign: string | null
}

/**
 * Everyone who signed up through the affiliate's link or bought through it, newest first.
 *
 * Orders, revenue and commission count only purchases attributed to this affiliate.
 */
export async function affiliateClients(affiliateId: string): Promise<AffiliateClient[]> {
  const [referrals, orders] = await Promise.all([
    db.referral.findMany({
      where: { affiliateId, email: { not: null } },
      select: { email: true, signedUpAt: true, visitedAt: true, campaign: true },
    }),
    paidOrders(affiliateId),
  ])
  const commission = await commissionByOrder(affiliateId, orders.map((order) => order.id))

  type Draft = Omit<AffiliateClient, 'name' | 'email' | 'subscribed' | 'lastActiveAt'> & { rawEmail: string }
  const clients = new Map<string, Draft>()
  const draft = (email: string): Draft => {
    const key = email.trim().toLowerCase()
    let entry = clients.get(key)
    if (!entry) {
      entry = { key, rawEmail: email.trim(), joinedAt: new Date(8.64e15), how: 'bought', country: null, orders: 0, revenueCents: 0, commissionCents: 0, campaign: null }
      clients.set(key, entry)
    }
    return entry
  }

  for (const referral of referrals) {
    if (!referral.email) continue
    const entry = draft(referral.email)
    entry.how = 'link'
    const joined = referral.signedUpAt ?? referral.visitedAt
    if (joined < entry.joinedAt) entry.joinedAt = joined
    entry.campaign ??= referral.campaign
  }
  // Oldest first, so the country and campaign kept are the latest ones.
  for (const order of [...orders].reverse()) {
    const entry = draft(order.email)
    const at = order.paidAt ?? order.createdAt
    if (at < entry.joinedAt) entry.joinedAt = at
    entry.orders += 1
    entry.revenueCents += netCents(order)
    entry.commissionCents += commission.get(order.id) ?? 0
    entry.country = order.billingCountry ?? entry.country
    entry.campaign = order.affiliateCampaign ?? entry.campaign
  }

  const members = await db.member.findMany({
    where: { email: { in: [...clients.values()].map((entry) => entry.rawEmail), mode: 'insensitive' } },
    select: { email: true, firstName: true, lastName: true, billingCountry: true, subscriptionStatus: true, lastLoginAt: true },
  })
  const memberByEmail = new Map(members.map((member) => [member.email.toLowerCase(), member]))

  return [...clients.values()]
    .map(({ rawEmail, ...entry }) => {
      const member = memberByEmail.get(entry.key)
      return {
        ...entry,
        name: maskName(member?.firstName, member?.lastName, rawEmail),
        email: maskEmail(rawEmail),
        country: entry.country ?? member?.billingCountry ?? null,
        subscribed: member?.subscriptionStatus === 'active',
        lastActiveAt: member?.lastLoginAt ?? null,
      }
    })
    .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
}

// ---------------------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------------------

export type StatementRow = {
  id: string
  at: Date
  kind: 'commission' | 'override' | 'reversal' | 'payout' | 'adjustment'
  /** For an override: the sub-affiliate whose sale it was. Their client is theirs, not shown. */
  via: string | null
  orderNumber: number | null
  items: string
  client: string | null
  campaign: string | null
  saleCents: number | null
  ratePercent: number | null
  amountCents: number
  /**
   * held until payableAt; payable once it passes; refunded when a refund took it all back
   * (the reversal is its own row). Reversals, payouts and adjustments are settled.
   */
  status: 'held' | 'payable' | 'refunded' | 'reversed' | 'paid_out' | 'adjusted'
  payableAt: Date | null
}

/** Every money movement on the affiliate's account in the period, newest first. */
export async function affiliateStatement(affiliateId: string, days: number, now: Date = new Date()): Promise<StatementRow[]> {
  const since = periodStart(days, now)
  const entries = await db.ledgerEntry.findMany({
    where: { affiliateId, createdAt: { gte: since }, kind: { in: ['commission', 'override', 'reversal', 'payout', 'adjustment'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      kind: true,
      amountCents: true,
      payableAt: true,
      sharePercent: true,
      basisCents: true,
      note: true,
      createdAt: true,
      orderId: true,
      order: { select: { number: true, email: true, affiliateId: true, affiliateCampaign: true, affiliate: { select: { name: true } }, lines: { select: { name: true }, orderBy: { position: 'asc' } } } },
      refund: { select: { order: { select: { number: true, email: true, affiliateId: true, affiliateCampaign: true, affiliate: { select: { name: true } }, lines: { select: { name: true }, orderBy: { position: 'asc' } } } } } },
    },
  })

  // What refunds took back per order, from any date — a sale in this period may have been
  // refunded after it, and one refunded in full should not read as money on its way.
  const orderIds = entries.flatMap((entry) => ((entry.kind === 'commission' || entry.kind === 'override') && entry.orderId ? [entry.orderId] : []))
  const reversals = orderIds.length
    ? await db.ledgerEntry.findMany({
        where: { affiliateId, kind: 'reversal', refund: { orderId: { in: orderIds } } },
        select: { amountCents: true, refund: { select: { orderId: true } } },
      })
    : []
  const reversedByOrder = new Map<string, number>()
  for (const reversal of reversals) {
    const orderId = reversal.refund?.orderId
    if (orderId) reversedByOrder.set(orderId, (reversedByOrder.get(orderId) ?? 0) + reversal.amountCents)
  }

  const emails = [...new Set(entries.flatMap((entry) => {
    const email = (entry.order ?? entry.refund?.order)?.email
    return email ? [email] : []
  }))]
  const members = emails.length
    ? await db.member.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { email: true, firstName: true, lastName: true } })
    : []
  const memberByEmail = new Map(members.map((member) => [member.email.toLowerCase(), member]))

  return entries.map((entry) => {
    const order = entry.order ?? entry.refund?.order ?? null
    const member = order ? memberByEmail.get(order.email.toLowerCase()) : undefined
    const kind = entry.kind as StatementRow['kind']
    // A reversal on a sub-affiliate's sale belongs to the override it reverses.
    const throughSub = !!order && order.affiliateId !== affiliateId
    return {
      id: entry.id,
      at: entry.createdAt,
      kind,
      orderNumber: order?.number ?? null,
      items: order ? order.lines.map((line) => line.name).join(', ') : entry.note ?? '',
      client: order && !throughSub ? maskName(member?.firstName, member?.lastName, order.email) : null,
      campaign: throughSub ? null : order?.affiliateCampaign ?? null,
      via: throughSub ? order?.affiliate?.name ?? 'Sub-affiliate' : null,
      saleCents: entry.basisCents,
      ratePercent: entry.sharePercent,
      amountCents: entry.amountCents,
      status:
        kind === 'commission' || kind === 'override'
          ? entry.amountCents + (reversedByOrder.get(entry.orderId ?? '') ?? 0) <= 0
            ? 'refunded'
            : entry.payableAt && entry.payableAt > now
            ? 'held'
            : 'payable'
          : kind === 'reversal'
            ? 'reversed'
            : kind === 'payout'
              ? 'paid_out'
              : 'adjusted',
      payableAt: entry.payableAt,
    }
  })
}

// ---------------------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------------------

export type CampaignRow = {
  campaign: string | null
  clicks: number
  signups: number
  sales: number
  revenueCents: number
  commissionCents: number
}

/** Clicks, sign-ups and sales per campaign tag in the period, busiest first. */
export async function affiliateCampaigns(affiliateId: string, days: number, now: Date = new Date()): Promise<CampaignRow[]> {
  const since = periodStart(days, now)
  const [referrals, orders] = await Promise.all([
    db.referral.findMany({ where: { affiliateId, visitedAt: { gte: since } }, select: { campaign: true, signedUpAt: true } }),
    paidOrders(affiliateId, since),
  ])
  const commission = await commissionByOrder(affiliateId, orders.map((order) => order.id))

  const rows = new Map<string, CampaignRow>()
  const row = (campaign: string | null) => {
    const key = campaign ?? ''
    let entry = rows.get(key)
    if (!entry) {
      entry = { campaign, clicks: 0, signups: 0, sales: 0, revenueCents: 0, commissionCents: 0 }
      rows.set(key, entry)
    }
    return entry
  }
  for (const referral of referrals) {
    const entry = row(referral.campaign)
    entry.clicks += 1
    if (referral.signedUpAt) entry.signups += 1
  }
  for (const order of orders) {
    const entry = row(order.affiliateCampaign)
    entry.sales += 1
    entry.revenueCents += netCents(order)
    entry.commissionCents += commission.get(order.id) ?? 0
  }
  return [...rows.values()].sort((a, b) => b.clicks + b.sales * 100 - (a.clicks + a.sales * 100))
}

// ---------------------------------------------------------------------------------------
// Sub-affiliates
// ---------------------------------------------------------------------------------------

export type SubAffiliateRow = {
  id: string
  name: string
  slug: string
  status: string
  joinedAt: Date
  overridePercent: number
  clicks: number
  sales: number
  revenueCents: number
  /** What the master earned on this sub's sales in the period, after refunds. */
  overrideCents: number
}

/**
 * The partners an affiliate brought in, with what each sold in the period and what the
 * master earned on it. Partners rather than customers, so named in full — but their own
 * clients stay theirs: nothing here reaches past the sub-affiliate to who bought.
 */
export async function affiliateSubs(affiliateId: string, days: number, now: Date = new Date()): Promise<SubAffiliateRow[]> {
  const since = periodStart(days, now)
  const subs = await db.affiliate.findMany({
    where: { parentAffiliateId: affiliateId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, slug: true, status: true, createdAt: true, overridePercent: true },
  })
  if (subs.length === 0) return []
  const ids = subs.map((sub) => sub.id)

  const [clicks, orders, overrides] = await Promise.all([
    db.referral.groupBy({ by: ['affiliateId'], where: { affiliateId: { in: ids }, visitedAt: { gte: since } }, _count: true }),
    db.checkoutOrder.findMany({
      where: { affiliateId: { in: ids }, status: 'paid', isTest: false, paidAt: { gte: since } },
      select: { ...ORDER_SELECT, affiliateId: true },
    }),
    db.ledgerEntry.findMany({
      where: {
        affiliateId,
        createdAt: { gte: since },
        OR: [
          { kind: 'override', order: { affiliateId: { in: ids } } },
          { kind: 'reversal', refund: { order: { affiliateId: { in: ids } } } },
        ],
      },
      select: { amountCents: true, order: { select: { affiliateId: true } }, refund: { select: { order: { select: { affiliateId: true } } } } },
    }),
  ])

  return subs.map((sub) => {
    const mine = orders.filter((order) => order.affiliateId === sub.id)
    return {
      id: sub.id,
      name: sub.name,
      slug: sub.slug,
      status: sub.status,
      joinedAt: sub.createdAt,
      overridePercent: sub.overridePercent ?? SUB_AFFILIATE_OVERRIDE_PERCENT,
      clicks: clicks.find((row) => row.affiliateId === sub.id)?._count ?? 0,
      sales: mine.length,
      revenueCents: mine.reduce((sum, order) => sum + netCents(order), 0),
      overrideCents: overrides
        .filter((entry) => (entry.order?.affiliateId ?? entry.refund?.order.affiliateId) === sub.id)
        .reduce((sum, entry) => sum + entry.amountCents, 0),
    }
  })
}
