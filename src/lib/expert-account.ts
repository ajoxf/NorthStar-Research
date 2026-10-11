import 'server-only'

import { db } from '@/lib/db'
import type { StatementEntry } from '@/lib/expert-statement'
import { refundPortions } from '@/lib/ledger'
import { parsePriceCents } from '@/lib/package-shape'
import { findOrCreatePortalMember, sendPortalInvite, type InviteResult } from '@/lib/portal-account'
import { sectionName } from '@/lib/section-shape'

/** The expert a member signs in as, if any. A retired expert keeps the page, for their money. */
export async function authorForMember(memberId: string) {
  return db.author.findFirst({ where: { memberId }, orderBy: { createdAt: 'asc' } })
}

/**
 * Give an expert their page: link them to a member account and tell them it is there.
 * See portal-account.ts for which account, and why the email carries no sign-in token.
 */
export async function inviteExpert(authorId: string, emailInput: string): Promise<InviteResult> {
  const author = await db.author.findUnique({ where: { id: authorId } })
  if (!author) return { ok: false, error: 'No such expert.', status: 404 }

  const email = emailInput.trim().toLowerCase()
  if (!email) return { ok: false, error: 'Enter the email they will sign in with.', status: 400 }

  const existing = await db.member.findUnique({ where: { email }, select: { id: true, role: true } })
  if (existing?.role === 'admin') {
    // An admin already sees everything; linking one would also send them to /admin, never here.
    return { ok: false, error: 'That is an admin account. Use the expert’s own address.', status: 409 }
  }
  if (existing) {
    const other = await db.author.findFirst({
      where: { memberId: existing.id, id: { not: author.id } },
      select: { name: true },
    })
    if (other) return { ok: false, error: `That account is already linked to ${other.name}.`, status: 409 }
  }

  const { member, created } = await findOrCreatePortalMember(email, author.name)
  await db.author.update({ where: { id: author.id }, data: { memberId: member.id } })
  return sendPortalInvite('expert', { email, name: author.name }, created)
}

const orderSelect = {
  paidAt: true,
  createdAt: true,
  amount: true,
  grossCents: true,
  sectionId: true,
  packageId: true,
  lines: { select: { authorId: true, chargeCents: true, sectionId: true, packageId: true } },
  ledger: { where: { kind: 'earning' as const }, select: { authorId: true, amountCents: true } },
}

type StatementOrder = {
  paidAt: Date | null
  createdAt: Date
  amount: string
  grossCents: number | null
  sectionId: string | null
  packageId: string | null
  lines: { authorId: string | null; chargeCents: number; sectionId: string | null; packageId: string | null }[]
  ledger: { authorId: string | null; amountCents: number }[]
}

/**
 * Everything the expert's sales tables are built from, read as totals' raw material.
 *
 * Each entry carries amounts and the products it was for — never the order's buyer. No
 * member, email or order id leaves this function; the page groups these into periods, and
 * nothing that could be listed one payment at a time reaches the browser.
 */
export async function expertStatement(authorId: string): Promise<{ entries: StatementEntry[]; names: Map<string, string> }> {
  const rows = await db.ledgerEntry.findMany({
    where: { authorId, kind: { in: ['earning', 'reversal'] } },
    select: {
      kind: true,
      amountCents: true,
      basisCents: true,
      createdAt: true,
      order: { select: orderSelect },
      refund: { select: { refundedAt: true, order: { select: orderSelect } } },
    },
  })

  const productsOf = (order: StatementOrder | null | undefined) => {
    if (!order) return []
    const mine = order.lines.filter((line) => line.authorId === authorId)
    if (mine.length > 0) {
      return mine
        .map((line) => ({ key: line.sectionId ?? line.packageId ?? '', weight: line.chargeCents }))
        .filter((product) => product.key)
    }
    const key = order.sectionId ?? order.packageId
    return key ? [{ key, weight: 1 }] : []
  }

  const entries: StatementEntry[] = rows.map((row) => {
    if (row.kind === 'earning') {
      const order = row.order
      const gross = order ? (order.grossCents ?? parsePriceCents(order.amount) ?? 0) : 0
      const portion = order ? refundPortions(order, gross).find((part) => part.authorId === authorId) : undefined
      return {
        kind: 'earning',
        amountCents: row.amountCents,
        at: order?.paidAt ?? order?.createdAt ?? row.createdAt,
        grossCents: portion?.grossCents ?? row.basisCents,
        netCents: row.basisCents,
        products: productsOf(order),
      }
    }
    return {
      kind: 'reversal',
      amountCents: row.amountCents,
      at: row.refund?.refundedAt ?? row.createdAt,
      products: productsOf(row.refund?.order),
    }
  })

  const keys = [...new Set(entries.flatMap((entry) => entry.products.map((product) => product.key)))]
  const [sections, packages] = await Promise.all([
    db.section.findMany({
      where: { id: { in: keys } },
      select: { id: true, displayName: true, topic: { select: { name: true } }, author: { select: { name: true } } },
    }),
    db.package.findMany({ where: { id: { in: keys } }, select: { id: true, name: true } }),
  ])
  const names = new Map<string, string>([
    ...sections.map((section) => [section.id, sectionName(section)] as [string, string]),
    ...packages.map((pkg) => [pkg.id, pkg.name] as [string, string]),
  ])
  return { entries, names }
}
