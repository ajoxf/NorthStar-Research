import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { planConversion } from '@/lib/access-conversion'
import { isAllAccess } from '@/lib/entitlements'
import { sectionName } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `false` previews, `true` writes. The preview is not optional in the UI — the thing
 * being changed is somebody's paid-for access, so the operator sees the outcome named
 * before it happens rather than after.
 */
const schema = z.object({ confirm: z.boolean().default(false) })

/**
 * Move one member off all-access and onto the sections they bought.
 *
 * Reads what they bought from `Member.packageId`, which redemption records, resolves that
 * package to its live sections, writes one entitlement per section carrying the member's
 * own renewal date, and only then clears the subscription columns that grant everything.
 *
 * **Order matters and is not an implementation detail.** The entitlements are written
 * first and the all-access columns cleared last, inside one transaction. Reversed, a
 * failure between the two steps leaves a paying member with nothing — the exact outcome
 * every refusal in `planConversion` exists to avoid, reintroduced by a crash.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const member = await db.member.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      role: true,
      subscriptionStatus: true,
      subscriptionRenewsAt: true,
      packageId: true,
    },
  })
  if (!member) return NextResponse.json({ error: 'No such member.' }, { status: 404 })

  /*
   * The package's live contents, resolved to sections.
   *
   * Archived items are left out: an item withdrawn from sale should not be granted afresh
   * to anybody, and a member who held it keeps their existing entitlement either way,
   * because nothing here removes one.
   */
  const contents = member.packageId
    ? await db.packageItem.findMany({
        where: { packageId: member.packageId, item: { archivedAt: null } },
        select: {
          itemId: true,
          item: {
            select: {
              id: true,
              section: { select: { id: true, displayName: true, topic: true, author: true } },
            },
          },
        },
      })
    : []

  const packageFound = member.packageId
    ? (await db.package.count({ where: { id: member.packageId } })) > 0
    : false

  /*
   * Sections only. A package may also carry a product — Nexus RAMP and whatever follows —
   * and those are granted by the same entitlement table but are not the desk's writing.
   * They are converted alongside, but the plan names sections because that is what the
   * operator is deciding about.
   */
  const sections = contents
    .filter((row) => row.item?.section)
    .map((row) => ({ id: row.item!.section!.id, name: sectionName(row.item!.section!) }))

  const plan = planConversion({
    member: {
      allAccess: isAllAccess(member),
      subscriptionRenewsAt: member.subscriptionRenewsAt,
      packageId: member.packageId,
    },
    packageSections: sections,
    packageFound,
  })

  if (!plan.ok) {
    return NextResponse.json({ ok: false, reason: plan.reason, error: plan.message }, { status: 400 })
  }

  if (!input.data.confirm) {
    return NextResponse.json({
      ok: true,
      preview: true,
      sections: plan.sections,
      renewsAt: plan.renewsAt?.toISOString() ?? null,
    })
  }

  const now = new Date()
  await db.$transaction(async (tx) => {
    for (const row of contents) {
      const sectionId = row.item?.section?.id ?? null
      const existing = await tx.entitlement.findFirst({
        where: {
          memberId: member.id,
          OR: [{ itemId: row.itemId }, ...(sectionId ? [{ sectionId }] : [])],
        },
        select: { id: true },
      })

      const data = {
        status: 'active' as const,
        startedAt: now,
        renewsAt: plan.renewsAt,
        cancelAtPeriodEnd: false,
        itemId: row.itemId,
        sectionId,
      }

      if (existing) {
        await tx.entitlement.update({ where: { id: existing.id }, data })
      } else {
        await tx.entitlement.create({ data: { ...data, memberId: member.id } })
      }
    }

    /*
     * Cleared last, and only the columns that grant.
     *
     * `packageId` stays: it is the record of what they bought, and it is what made this
     * conversion possible. Clearing it would destroy the only evidence of the purchase
     * the moment the purchase stopped being the thing granting access.
     *
     * `subscriptionRenewsAt` stays too, for the same reason — it is now carried on the
     * entitlements, and keeping it here leaves the original date legible.
     */
    await tx.member.update({
      where: { id: member.id },
      data: { subscriptionStatus: 'expired' },
    })
  })

  return NextResponse.json({ ok: true, converted: plan.sections.length })
}
