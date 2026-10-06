import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import { CregisError, createCheckout } from '@/lib/cregis'
import { amountString, isFallbackPackage } from '@/lib/package-shape'
import { priceWithOffer } from '@/lib/offer'
import { offerForCheckout } from '@/lib/offers'
import { packageForCheckout } from '@/lib/packages'
import { normalisePhone } from '@/lib/utils'

export const runtime = 'nodejs'

const schema = z.object({
  email: emailSchema,
  phoneNumber: z.string().trim().optional(),
  packageId: z.string().trim().max(64).optional(),
  /** A discount code, if the buyer typed one. Blank and wrong are the same thing here. */
  offerCode: z.string().trim().max(64).optional(),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const email = parsed.data.email.trim().toLowerCase()
  const phoneNumber = parsed.data.phoneNumber ? normalisePhone(parsed.data.phoneNumber) : null

  const pkg = await packageForCheckout(parsed.data.packageId)

  /*
   * The built-in fallback plan corresponds to no row, so nothing can be scoped to it and
   * an offer covering "everything" has no package id to record against the order. It is
   * priced at the list price, which is the honest answer for a plan that exists only when
   * no package has been created at all.
   */
  const packageId = isFallbackPackage(pkg) ? null : pkg.id
  const offer = packageId
    ? await offerForCheckout({ packageId }, parsed.data.offerCode)
    : null
  const priced = priceWithOffer(pkg.priceCents, offer)

  // Recorded before contacting Cregis so an order exists to reconcile the callback
  // against even if the call or the browser session dies part-way through.
  const order = await db.checkoutOrder.create({
    data: {
      cregisOrderId: `pending_${crypto.randomUUID()}`,
      email,
      phoneNumber,
      amount: amountString(priced.chargeCents),
      currency: pkg.currency,
      packageId,
      offerId: priced.offerId,
      status: 'pending',
    },
  })

  try {
    const result = await createCheckout({
      orderId: order.id,
      email,
      amount: amountString(priced.chargeCents),
      currency: pkg.currency,
      remark: pkg.name,
    })

    await db.checkoutOrder.update({
      where: { id: order.id },
      data: { cregisOrderId: result.cregisOrderId },
    })

    return NextResponse.json({ ok: true, checkoutUrl: result.checkoutUrl, orderId: order.id })
  } catch (error) {
    await db.checkoutOrder.update({ where: { id: order.id }, data: { status: 'failed' } })

    if (error instanceof MissingConfigError) {
      // Section 5.1: a placeholder must never look like a working integration.
      console.error(`[checkout] ${error.message}`)
      return NextResponse.json(
        {
          error:
            'Payments are not configured for this deployment yet. Please contact support — nothing has been charged.',
          missingConfig: error.keys,
        },
        { status: 503 },
      )
    }

    if (error instanceof CregisError) {
      console.error(`[checkout] ${error.message}`)
      return NextResponse.json(
        { error: 'The payment service rejected this request. Please try again shortly.' },
        { status: 502 },
      )
    }

    console.error('[checkout] unexpected failure', error)
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 })
  }
}
