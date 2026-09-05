import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import { amountString } from '@/lib/package-shape'
import { sectionName } from '@/lib/section-shape'
import { createStripeCheckout, createStripePrice, stripeConfigured } from '@/lib/stripe'
import { createCheckout } from '@/lib/cregis'
import { emailSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: emailSchema,
  sectionId: z.string().trim().min(1).max(64),
  method: z.enum(['card', 'crypto']).default('card'),
})

/**
 * Buy one section.
 *
 * Access is granted by the webhook and the redemption that follows it, never here — the
 * same rule the all-access checkout follows, for the same reason: reaching a URL is not
 * proof of payment.
 *
 * Deliberately does not refuse somebody who already has a membership. Buying a second
 * section is a normal thing to do, and so is an all-access member buying a section they
 * want billed separately; the entitlement is keyed on (member, section), so the only case
 * this cannot express — buying the same section twice — extends it rather than duplicating.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const email = parsed.data.email.trim().toLowerCase()
  const section = await db.section.findUnique({
    where: { id: parsed.data.sectionId },
    include: { topic: true, author: true },
  })

  if (!section || section.archivedAt !== null) {
    return NextResponse.json(
      { error: 'That section is not on sale. Nothing has been charged.' },
      { status: 404 },
    )
  }

  const name = sectionName(section)

  // Already holds it, and it has not lapsed — say so rather than taking money for a
  // second copy of something they can already read.
  const member = await db.member.findUnique({ where: { email }, select: { id: true } })
  if (member) {
    const held = await db.entitlement.findUnique({
      where: { memberId_sectionId: { memberId: member.id, sectionId: section.id } },
      select: { status: true, renewsAt: true },
    })
    if (held?.status === 'active' && (!held.renewsAt || held.renewsAt.getTime() > Date.now())) {
      return NextResponse.json(
        { error: `You already subscribe to ${name}. Sign in to read it.` },
        { status: 409 },
      )
    }
  }

  try {
    if (parsed.data.method === 'crypto') {
      // The row is written first so it exists to be echoed back on the callback, then
      // stamped with the processor's own id — the same order the all-access crypto
      // checkout uses, and the reason a Cregis callback can always find its order.
      const order = await db.checkoutOrder.create({
        data: {
          cregisOrderId: `pending-${crypto.randomUUID()}`,
          provider: 'cregis',
          email,
          amount: amountString(section.priceCents),
          currency: section.currency,
          sectionId: section.id,
          status: 'pending',
        },
      })

      const result = await createCheckout({
        orderId: order.id,
        email,
        amount: amountString(section.priceCents),
        currency: section.currency,
        remark: name,
      })

      await db.checkoutOrder.update({
        where: { id: order.id },
        data: { cregisOrderId: result.cregisOrderId },
      })

      return NextResponse.json({ ok: true, checkoutUrl: result.checkoutUrl })
    }

    if (!stripeConfigured()) {
      return NextResponse.json(
        { error: 'Card payment is not available yet. Choose crypto — nothing has been charged.' },
        { status: 409 },
      )
    }

    /*
     * The Stripe price is created the first time a section is sold, not when it is set up.
     *
     * A section can be configured, priced and filled with reports long before anyone buys
     * one, and minting a Stripe price for every section the desk sketches out would leave
     * a trail of unused products. Creating it here means the price exists exactly when it
     * is first needed, and is reused on every later sale.
     *
     * Stripe prices are immutable, so a section whose price has been edited since gets a
     * new one — the old price keeps billing whoever is already on it, which is what
     * "a new price applies to new subscribers" means in practice.
     */
    let priceId = section.stripePriceId
    if (!priceId) {
      const created = await createStripePrice({
        priceCents: section.priceCents,
        currency: section.currency,
        interval: section.interval,
        productName: name,
        productId: section.stripeProductId,
      })
      priceId = created.priceId
      await db.section.update({
        where: { id: section.id },
        data: { stripePriceId: created.priceId, stripeProductId: created.productId },
      })
    }

    const { url, sessionId } = await createStripeCheckout(email, {
      priceId,
      planName: name,
      sectionId: section.id,
    })

    await db.checkoutOrder.create({
      data: {
        cregisOrderId: sessionId,
        provider: 'stripe',
        email,
        // What we believe is being charged. Stripe is the authority on the real amount;
        // this row is what makes a divergence visible rather than invisible.
        amount: amountString(section.priceCents),
        currency: section.currency,
        sectionId: section.id,
        status: 'pending',
      },
    })

    return NextResponse.json({ ok: true, checkoutUrl: url })
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(`[checkout:section] ${error.message}`)
      return NextResponse.json(
        { error: 'Payment is not configured yet. Nothing has been charged.' },
        { status: 503 },
      )
    }
    console.error('[checkout:section] failed', error)
    return NextResponse.json(
      { error: 'Could not start checkout. Nothing has been charged.' },
      { status: 502 },
    )
  }
}
