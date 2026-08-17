import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import { CregisError, createCheckout } from '@/lib/cregis'
import { amountString } from '@/lib/package-shape'
import { createStripeTestCheckout } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Start a small live payment the operator makes to themselves, to prove the plumbing.
 *
 * Presence checks and the read-only verifier already answer "is this configured?". They
 * cannot answer "does a real payment reach us?" — that needs money to actually move, a
 * processor to actually call back, and a signature to actually verify. This is the only
 * thing that tests the whole path end to end.
 *
 * Three rules make that safe to offer from an admin screen:
 *
 * - **It is real money.** One dollar, live mode, to the operator's own card or wallet.
 *   The screen says so rather than implying a sandbox.
 * - **It grants nothing.** The order is flagged `isTest`, and both webhooks stop at
 *   recording it — no redemption code, no member, no receipt, no affiliate credit. A
 *   probe that minted a membership would be worse than no probe.
 * - **It is charged once.** The Stripe side is a one-off payment, not a subscription, so
 *   there is no recurring charge left behind for someone to remember to cancel.
 *
 * The cost of that last choice is stated on the screen: this proves checkout, settlement
 * and webhook delivery, not the renewal path, which only a real `invoice.paid` exercises.
 */
const schema = z.object({
  processor: z.enum(['stripe', 'cregis']),
  /** Fixed at a dollar by default; kept a parameter so it is not a magic number. */
  amountCents: z.number().int().min(100).max(500).default(100),
})

export async function POST(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose which processor to test.' }, { status: 400 })
  }

  const { processor, amountCents } = parsed.data
  const amount = amountString(amountCents)

  try {
    if (processor === 'stripe') {
      const { url, sessionId } = await createStripeTestCheckout(admin.email, amountCents)

      await db.checkoutOrder.create({
        data: {
          cregisOrderId: sessionId,
          provider: 'stripe',
          email: admin.email,
          amount,
          currency: 'USD',
          status: 'pending',
          isTest: true,
        },
      })

      return NextResponse.json({ ok: true, checkoutUrl: url })
    }

    // Cregis, like a real crypto checkout: the order exists before the call, so a
    // callback always has something to reconcile against.
    const order = await db.checkoutOrder.create({
      data: {
        cregisOrderId: `test_${crypto.randomUUID()}`,
        provider: 'cregis',
        email: admin.email,
        amount,
        currency: 'USD',
        status: 'pending',
        isTest: true,
      },
    })

    try {
      const result = await createCheckout({
        orderId: order.id,
        email: admin.email,
        amount,
        currency: 'USD',
        remark: 'NordStar Pro — configuration test',
      })

      await db.checkoutOrder.update({
        where: { id: order.id },
        data: { cregisOrderId: result.cregisOrderId },
      })

      return NextResponse.json({ ok: true, checkoutUrl: result.checkoutUrl })
    } catch (error) {
      await db.checkoutOrder.update({ where: { id: order.id }, data: { status: 'failed' } })
      throw error
    }
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return NextResponse.json(
        {
          error: `${processor === 'stripe' ? 'Stripe' : 'Cregis'} is not configured yet: ${error.keys.join(', ')} ${
            error.keys.length === 1 ? 'is' : 'are'
          } missing.`,
        },
        { status: 503 },
      )
    }

    if (error instanceof CregisError) {
      // The whole point of the probe: a rejection here is the finding, so it is reported
      // verbatim rather than softened into "something went wrong".
      return NextResponse.json({ error: `Cregis rejected the test: ${error.message}` }, { status: 502 })
    }

    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `The test could not be started: ${message}` }, { status: 502 })
  }
}
