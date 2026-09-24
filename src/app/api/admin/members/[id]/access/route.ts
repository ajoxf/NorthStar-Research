import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { addMonths } from '@/lib/grant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  sectionId: z.string().min(1),
  /**
   * How long the grant runs for, or null for open-ended.
   *
   * Null is a real answer here, not a missing one — a comp that never lapses — which is
   * why the form offers it as its own choice rather than as an empty field. Giving away
   * permanent access should be something somebody picked on purpose.
   */
  months: z.number().int().min(1).max(60).nullable(),
})

/**
 * Grant a member one section by hand.
 *
 * **This writes an entitlement and never touches the subscription columns on Member.**
 * Those columns *are* the legacy all-access membership — `isAllAccess` reads them and
 * returns true before any entitlement is consulted — so setting them to grant one section
 * would hand over the entire archive. The same rule the redemption path lives under; see
 * the note at the top of src/lib/grant.ts.
 *
 * Extends rather than duplicates. There is a unique index on (memberId, sectionId), so a
 * second grant of the same section has to be an update — and an operator regranting
 * something almost always means "give them more", not "start again from today", so the
 * new period is measured from whichever is later: now, or what they already have.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const [member, section] = await Promise.all([
    db.member.findUnique({ where: { id: params.id }, select: { id: true } }),
    db.section.findUnique({
      where: { id: input.data.sectionId },
      select: { id: true, item: { select: { id: true } } },
    }),
  ])
  if (!member) return NextResponse.json({ error: 'No such member.' }, { status: 404 })
  if (!section) {
    return NextResponse.json(
      { error: 'That section no longer exists. Reload the page and choose again.' },
      { status: 400 },
    )
  }

  const now = new Date()
  const existing = await db.entitlement.findFirst({
    where: { memberId: member.id, sectionId: section.id },
    select: { id: true, renewsAt: true },
  })

  /*
   * Measured from the later of now and the existing end date.
   *
   * Regranting three months to somebody with a month still to run should leave them four
   * months, not three — the alternative quietly takes time off a member who has done
   * nothing wrong, and does it invisibly.
   */
  const from =
    existing?.renewsAt && existing.renewsAt.getTime() > now.getTime() ? existing.renewsAt : now
  const renewsAt = input.data.months === null ? null : addMonths(from, input.data.months)

  const data = {
    status: 'active' as const,
    startedAt: now,
    renewsAt,
    cancelAtPeriodEnd: false,
    /*
     * No billing provider, deliberately.
     *
     * Nothing was charged, so naming a payment rail would put a sale in the record that
     * never happened — and `accessSource` reads these columns back to tell an operator
     * where access came from. A hand-granted row has to stay recognisable as one.
     */
    billingProvider: null,
    itemId: section.item?.id ?? null,
  }

  if (existing) {
    await db.entitlement.update({ where: { id: existing.id }, data })
  } else {
    await db.entitlement.create({ data: { ...data, memberId: member.id, sectionId: section.id } })
  }

  return NextResponse.json({ ok: true })
}
