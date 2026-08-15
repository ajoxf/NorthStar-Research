import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { MissingConfigError, PLAN } from '@/lib/env'
import { createStripeCheckout } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ email: emailSchema })

/** Start a $199/month card subscription. Access is granted by the webhook, not here. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const email = parsed.data.email.trim().toLowerCase()

  const existing = await db.member.findUnique({ where: { email } })
  if (existing?.passwordHash && existing.subscriptionStatus === 'active') {
    return NextResponse.json(
      { error: 'That email already has an active membership. Sign in instead.' },
      { status: 409 },
    )
  }

  try {
    const { url, sessionId } = await createStripeCheckout(email)

    await db.checkoutOrder.create({
      data: {
        cregisOrderId: sessionId,
        provider: 'stripe',
        email,
        amount: PLAN.amount,
        currency: PLAN.currency,
        status: 'pending',
      },
    })

    return NextResponse.json({ ok: true, checkoutUrl: url })
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(`[checkout:stripe] ${error.message}`)
      return NextResponse.json(
        {
          error:
            'Card payments are not configured for this deployment yet. Please contact support — nothing has been charged.',
          missingConfig: error.keys,
        },
        { status: 503 },
      )
    }

    console.error('[checkout:stripe] failed', error)
    return NextResponse.json(
      { error: 'Checkout could not be started. Please try again shortly.' },
      { status: 502 },
    )
  }
}
