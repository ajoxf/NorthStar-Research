import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ action: z.literal('expire') })

/**
 * Stop one section entitlement.
 *
 * **Expire, never delete.** The row stays with its dates, its provider and its Stripe
 * subscription id, and simply stops granting. Deleting it would take with it the only
 * record that this person ever had access — which is precisely the record needed when
 * somebody disputes a charge, or asks why they were cut off, or when an operator is
 * working out whether a refund is owed. Nothing on this site is ever deleted.
 *
 * `cancelAtPeriodEnd` is deliberately not what this sets. That flag means "let it run to
 * the date already paid for"; this is the other thing an operator sometimes needs, which
 * is for access to stop now.
 *
 * What this does *not* do is cancel anything at Stripe. A card subscription that is still
 * live there will keep charging and the next invoice will grant it back, so the response
 * says so rather than leaving an operator to discover it at the next renewal.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; entitlementId: string } },
) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const entitlement = await db.entitlement.findFirst({
    // Matched on both ids: without the memberId an entitlement belonging to somebody else
    // could be expired from this member's page by editing one value in the URL.
    where: { id: params.entitlementId, memberId: params.id },
    select: { id: true, stripeSubscriptionId: true },
  })
  if (!entitlement) {
    return NextResponse.json({ error: 'No such entitlement for this member.' }, { status: 404 })
  }

  await db.entitlement.update({
    where: { id: entitlement.id },
    data: { status: 'expired', renewsAt: new Date(), cancelAtPeriodEnd: false },
  })

  return NextResponse.json({
    ok: true,
    warning: entitlement.stripeSubscriptionId
      ? 'Access has stopped, but the card subscription is still live at Stripe and the next ' +
        'payment will restore it. Cancel it in Stripe as well.'
      : null,
  })
}
