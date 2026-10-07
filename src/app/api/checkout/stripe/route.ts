import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import { amountString, isFallbackPackage } from '@/lib/package-shape'
import { priceWithOffer } from '@/lib/offer'
import { offerForCheckout, stripeCouponForOffer } from '@/lib/offers'
import { packageForCheckout } from '@/lib/packages'
import { createStripeCheckout } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: emailSchema,
  packageId: z.string().trim().max(64).optional(),
  /** A discount code, if the buyer typed one. Blank and wrong are the same thing here. */
  offerCode: z.string().trim().max(64).optional(),
})

/**
 * Start a card subscription. Access is granted by the webhook, not here.
 *
 * The price comes from the package's own Stripe price, and a package without one cannot
 * be sold by card at all. The alternative — falling back to `STRIPE_PRICE_ID` — would
 * charge every package the same amount while each advertised its own, which is the one
 * failure this whole feature has to make impossible.
 */
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

  const pkg = await packageForCheckout(parsed.data.packageId)

  if (!isFallbackPackage(pkg) && !pkg.stripePriceId) {
    return NextResponse.json(
      {
        error:
          'This membership cannot be paid by card yet. Choose crypto, or contact support — nothing has been charged.',
      },
      { status: 409 },
    )
  }

  // The built-in fallback plan corresponds to no row, so nothing can be scoped to it.
  const packageId = isFallbackPackage(pkg) ? null : pkg.id
  const offer = packageId
    ? await offerForCheckout({ packageId }, parsed.data.offerCode)
    : null
  const priced = priceWithOffer(pkg.priceCents, offer)

  try {
    /*
     * The discount rides as a coupon, not as a second Price at the sale amount — which
     * would leave whoever bought during a campaign billed at it for ever, with nothing
     * recording why.
     */
    const couponId = offer ? await stripeCouponForOffer(offer) : null

    const { url, sessionId } = await createStripeCheckout(email, {
      priceId: pkg.stripePriceId,
      planName: pkg.name,
      packageId: packageId ?? undefined,
      couponId,
      offerId: priced.offerId,
    })

    await db.checkoutOrder.create({
      data: {
        cregisOrderId: sessionId,
        provider: 'stripe',
        email,
        // What we believe is being charged, recorded at the moment of the order. Stripe
        // is the authority on the actual amount; this is the row that makes a divergence
        // visible afterwards rather than invisible.
        amount: amountString(priced.chargeCents),
        currency: pkg.currency,
        packageId,
        offerId: priced.offerId,
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
