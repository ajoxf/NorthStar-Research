import { NextResponse } from 'next/server'
import { z } from 'zod'

import { checkoutErrorResponse, startCheckout } from '@/lib/payments/checkout'
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
    /** A section, or a package; neither means the default package. */
    sectionId: z.string().trim().min(1).max(64).optional(),
    packageId: z.string().trim().max(64).optional(),
    phoneNumber: z.string().trim().optional(),
    /** A discount code, if the buyer typed one. Blank and wrong are the same thing here. */
    offerCode: z.string().trim().max(64).optional(),
  })
  .refine((input) => input.provider || input.method, { message: 'Choose how to pay.' })
  .refine((input) => !(input.sectionId && input.packageId), { message: 'Choose one thing to buy.' })

/**
 * Start a checkout — any item, any rail.
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
      target: input.sectionId
        ? { kind: 'section', id: input.sectionId }
        : { kind: 'package', id: input.packageId },
      offerCode: input.offerCode,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return checkoutErrorResponse(error, 'checkout')
  }
}
