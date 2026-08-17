import { NextResponse } from 'next/server'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { packageInputSchema } from '@/lib/package-shape'
import { setDefaultPackage, uniqueSlug } from '@/lib/packages'
import { resolveStripePrice } from '@/app/api/admin/packages/resolve-price'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create a package.
 *
 * The Stripe price is resolved against Stripe *before* the row is written, not after.
 * Saving first and warning second would leave a sellable package on the join page that
 * charges the wrong amount for however long it takes someone to read the warning, and
 * the buyers in between are charged what Stripe says regardless of what our row claims.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = packageInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }

  const input = parsed.data

  // Resolved before the row is written: a package that exists but cannot be charged
  // correctly is worse than one that was never created.
  const price = await resolveStripePrice({
    sellByCard: input.sellByCard,
    pastedPriceId: input.stripePriceId,
    desired: { ...input, name: input.name },
  })
  if (!price.ok) return NextResponse.json({ error: price.error }, { status: 400 })

  // The very first package becomes the default, because a site with packages and no
  // default would fall back to the built-in plan and quietly ignore what was just created.
  const existing = await db.package.count()

  const created = await db.package.create({
    data: {
      name: input.name,
      slug: await uniqueSlug(input.name),
      description: input.description || null,
      priceCents: input.priceCents,
      currency: input.currency,
      interval: input.interval,
      stripePriceId: price.stripePriceId,
      stripeProductId: price.stripeProductId,
      features: input.features,
      sortOrder: input.sortOrder,
      isDefault: existing === 0,
    },
  })

  if (created.isDefault) await setDefaultPackage(created.id)

  return NextResponse.json({ ok: true, id: created.id, slug: created.slug })
}
