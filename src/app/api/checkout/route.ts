import { NextResponse } from 'next/server'
import { z } from 'zod'

import { checkoutErrorResponse, startCheckout } from '@/lib/payments/checkout'
import { CART_MAX_ITEMS } from '@/lib/cart-shape'
import { METHOD_PROVIDER, PAYMENT_PROVIDER_IDS } from '@/lib/payments/ids'
import { normalisePhone } from '@/lib/utils'
import { emailSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    email: emailSchema,
    /** Which rail. `method` is the older name the forms sent, and is still accepted. */
    provider: z.enum(PAYMENT_PROVIDER_IDS).optional(),
    method: z.enum(['card', 'crypto']).optional(),
    /**
     * What to buy. A cart sends `items`; a single-item form may still send one sectionId or
     * packageId, and neither means the default package.
     */
    items: z
      .array(z.object({ kind: z.enum(['section', 'package']), id: z.string().trim().max(64) }))
      .min(1)
      .max(CART_MAX_ITEMS)
      .optional(),
    sectionId: z.string().trim().min(1).max(64).optional(),
    packageId: z.string().trim().max(64).optional(),
    phoneNumber: z.string().trim().optional(),
    /** A discount code, if the buyer typed one. Blank and wrong are the same thing here. */
    offerCode: z.string().trim().max(64).optional(),
  })
  .refine((input) => input.provider || input.method, { message: 'Choose how to pay.' })
  .refine((input) => [input.items, input.sectionId, input.packageId].filter(Boolean).length <= 1, {
    message: 'Choose one thing to buy, or send a cart.',
  })

/**
 * Start a checkout — one item or a cart, any rail.
 *
 * The one checkout route. The rail is chosen by the buyer and resolved through the
 * payments registry; nothing here knows what Stripe or Cregis is. See
 * src/lib/payments/checkout.ts for what happens, and in what order.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const message = issue?.path[0] === 'email' || !issue ? 'Enter a valid email address.' : issue.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const input = parsed.data

  try {
    const result = await startCheckout({
      providerId: input.provider ?? METHOD_PROVIDER[input.method!],
      email: input.email,
      phoneNumber: input.phoneNumber ? normalisePhone(input.phoneNumber) : null,
      items:
        input.items ??
        (input.sectionId ? [{ kind: 'section', id: input.sectionId }] : [{ kind: 'package', id: input.packageId }]),
      offerCode: input.offerCode,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return checkoutErrorResponse(error, 'checkout')
  }
}
