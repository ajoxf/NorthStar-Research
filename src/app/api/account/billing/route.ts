import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { MissingConfigError } from '@/lib/env'
import { createBillingPortalSession } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Send a card member to Stripe's billing portal to update their card or cancel.
 *
 * Crypto members have no portal — there is nothing stored to manage. They simply renew
 * each period or lapse, which the account page explains rather than offering a button
 * that cannot work for them.
 */
export async function POST() {
  const member = await getCurrentMember()
  if (!member) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }

  if (!member.stripeCustomerId) {
    return NextResponse.json(
      { error: 'This membership is not billed by card, so there is nothing to manage here.' },
      { status: 400 },
    )
  }

  try {
    const url = await createBillingPortalSession(member.stripeCustomerId)
    return NextResponse.json({ ok: true, url })
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return NextResponse.json({ error: 'Card billing is not configured.' }, { status: 503 })
    }
    console.error('[billing] portal session failed', error)
    return NextResponse.json({ error: 'Could not open the billing portal.' }, { status: 502 })
  }
}
