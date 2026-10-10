import { NextResponse } from 'next/server'
import { z } from 'zod'

import { affiliateForCheckout } from '@/lib/affiliate-commission'
import { priceCart } from '@/lib/cart-shape'
import { priceWithOffer, type OfferShape } from '@/lib/offer'
import { offerByCode, offerForCheckout } from '@/lib/offers'
import { db } from '@/lib/db'
import { isFallbackPackage } from '@/lib/package-shape'
import { packageForCheckout } from '@/lib/packages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    packageId: z.string().trim().max(64).optional(),
    sectionId: z.string().trim().max(64).optional(),
    code: z.string().trim().max(64).optional(),
  })
  .refine((input) => Boolean(input.packageId) !== Boolean(input.sectionId), {
    message: 'Ask about one thing at a time.',
  })

/**
 * What this would actually cost, with a code applied.
 *
 * Exists because the alternative is worse: without it a buyer types a code, sees nothing
 * change, and only learns whether it worked on the payment page — or, for crypto, after
 * the amount is already fixed. Offers are not public data, so only the server can answer.
 *
 * **It is an oracle for "does this code work on this item", and that is unavoidable** —
 * any code box is. It is kept as narrow as possible: one item per call, so the catalogue
 * cannot be swept in one request, and the response carries a price and nothing else. The
 * campaign's name, its scope, its expiry and its remaining uses stay inside the admin.
 *
 * Nothing rate-limits it, because this app has no request limiter to hang it on. Codes are
 * operator-chosen strings rather than anything derived from a secret, so the exposure is
 * that a determined guesser could find a live code — the same exposure a code printed in a
 * newsletter already has. Worth knowing; not worth blocking the feature on.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nothing to price.' }, { status: 400 })
  }

  const { code } = parsed.data

  if (parsed.data.sectionId) {
    const section = await db.section.findUnique({
      where: { id: parsed.data.sectionId },
      select: { id: true, priceCents: true, currency: true, archivedAt: true },
    })
    if (!section || section.archivedAt !== null) {
      return NextResponse.json({ error: 'That is not on sale.' }, { status: 404 })
    }
    return quote({ sectionId: section.id }, section.priceCents, section.currency, code)
  }

  const pkg = await packageForCheckout(parsed.data.packageId)
  // The built-in fallback plan corresponds to no row, so nothing can be scoped to it.
  const packageId = isFallbackPackage(pkg) ? null : pkg.id
  if (!packageId) {
    return NextResponse.json({
      listCents: pkg.priceCents,
      chargeCents: pkg.priceCents,
      percentOff: 0,
      currency: pkg.currency,
      codeApplied: false,
    })
  }
  return quote({ packageId }, pkg.priceCents, pkg.currency, code)
}

async function quote(
  target: { sectionId?: string; packageId?: string },
  listCents: number,
  currency: string,
  code?: string,
) {
  // The buyer's own best offer, and the affiliate link's discount if they came by one —
  // one wins, by the same rule checkout uses (priceCart), so this figure is what is charged.
  const referral = await affiliateForCheckout()
  const best = priceCart(
    [{ target, listCents }],
    [await offerForCheckout(target, code), referral?.offer ?? null].filter((o): o is OfferShape => o !== null),
  ).offer
  const priced = priceWithOffer(listCents, best)

  /*
   * Whether the *code they typed* worked, asked separately.
   *
   * `offerForCheckout` deliberately falls back to a public sale when a code does not work,
   * which is right for the charge and wrong for the message: a buyer whose code failed
   * during a sale would otherwise see a reduced price and believe their code had been
   * accepted. So the code is checked on its own to decide what to tell them, while the
   * price stays whatever is best for them.
   */
  const codeApplied = code ? (await offerByCode(code, target)) !== null : false

  return NextResponse.json({
    listCents,
    chargeCents: priced.chargeCents,
    percentOff: priced.percentOff,
    duration: priced.duration,
    currency,
    codeApplied,
    codeRejected: Boolean(code) && !codeApplied,
  })
}
