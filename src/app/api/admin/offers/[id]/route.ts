import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminOnly } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { offerInputSchema } from '@/lib/offer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit an offer, or stop it.
 *
 * `action: 'archive'` is the stop button, and it is a distinct operation rather than a
 * field on the edit form for the same reason archiving a package is: a form that could
 * submit it by accident is a form that can end a campaign by mistake. Archiving beats
 * waiting for `endsAt` because an offer sometimes has to stop *now*.
 */
const actionSchema = z.object({ action: z.enum(['archive', 'restore']) })

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  // Guarded first, and the body read once. A request body is a stream: parsing it here and
  // handing the same Request to `adminInput` afterwards would hand it an empty one.
  const guard = await adminOnly()
  if (guard) return guard

  const body = await request.json().catch(() => null)

  const action = actionSchema.safeParse(body)
  if (action.success) {
    await db.offer.update({
      where: { id: params.id },
      data: { archivedAt: action.data.action === 'archive' ? new Date() : null },
    })
    return NextResponse.json({ ok: true })
  }

  const parsed = offerInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }
  const data = parsed.data
  // See the note in the create route: `.default([])` under `.refine()` infers as optional.
  const sectionIds = data.sectionIds ?? []
  const packageIds = data.packageIds ?? []

  const existing = await db.offer.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'No such offer.' }, { status: 404 })

  if (data.code && data.code !== existing.code) {
    const clash = await db.offer.findUnique({ where: { code: data.code }, select: { id: true } })
    if (clash) {
      return NextResponse.json(
        { error: `The code ${data.code} is already in use. Pick another.` },
        { status: 409 },
      )
    }
  }

  /*
   * A changed percentage or duration invalidates the Stripe coupon.
   *
   * Coupons are immutable, exactly like prices. Clearing the id here means the next card
   * sale mints a fresh coupon at the new terms; the old coupon stays attached to anybody
   * already carrying it, which is Stripe's behaviour and the correct one — a member who
   * bought at 25% off keeps 25% off rather than being silently re-billed.
   */
  const termsMoved =
    data.percentOff !== existing.percentOff || data.duration !== existing.duration

  await db.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: params.id },
      data: {
        name: data.name,
        code: data.code,
        percentOff: data.percentOff,
        duration: data.duration,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        maxRedemptions: data.maxRedemptions,
        appliesToEverything: data.appliesToEverything,
        ...(termsMoved ? { stripeCouponId: null } : {}),
      },
    })
    // Replaced wholesale rather than diffed: the form always sends the complete set, and
    // a diff would be more code for an identical result on a handful of rows.
    await tx.offerSection.deleteMany({ where: { offerId: params.id } })
    await tx.offerPackage.deleteMany({ where: { offerId: params.id } })
    if (sectionIds.length > 0) {
      await tx.offerSection.createMany({
        data: sectionIds.map((sectionId) => ({ offerId: params.id, sectionId })),
        skipDuplicates: true,
      })
    }
    if (packageIds.length > 0) {
      await tx.offerPackage.createMany({
        data: packageIds.map((packageId) => ({ offerId: params.id, packageId })),
        skipDuplicates: true,
      })
    }
  })

  return NextResponse.json({ ok: true })
}

/**
 * Delete an offer nothing has ever been bought under.
 *
 * The same rule packages follow, and the same reason: an offer a paid order points at is
 * the explanation for why that order was for less than the list price, and deleting it
 * turns a discounted sale into an unexplained one. Everything else archives.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const guard = await adminOnly()
  if (guard) return guard

  const used = await db.checkoutOrder.count({ where: { offerId: params.id } })
  if (used > 0) {
    return NextResponse.json(
      {
        error:
          `${used} order${used === 1 ? '' : 's'} were placed under this offer, so it is the record of ` +
          `why they cost what they did. Archive it instead — it stops applying and the orders still explain themselves.`,
      },
      { status: 409 },
    )
  }

  await db.offer.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
