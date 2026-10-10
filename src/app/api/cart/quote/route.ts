import { NextResponse } from 'next/server'
import { z } from 'zod'

import { affiliateForCheckout } from '@/lib/affiliate-commission'
import { heldKeys, priceLines, resolveCart } from '@/lib/cart'
import { CART_MAX_ITEMS, groupByInterval } from '@/lib/cart-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  items: z
    .array(z.object({ kind: z.enum(['section', 'package']), id: z.string().trim().max(64) }))
    .max(CART_MAX_ITEMS),
  code: z.string().trim().max(64).optional(),
  /** When given, sections this email already holds are flagged so the cart can drop them. */
  email: z.string().trim().max(254).optional(),
})

/**
 * Price a cart, as checkout would charge it.
 *
 * The browser holds the cart; this is the only thing that knows what it costs. Prices,
 * names and the discount all come from here, so a stale cart in somebody's browser can
 * never charge an old price — checkout re-prices through the same function anyway.
 *
 * One group per billing period, each priced on its own, because each is checked out as its
 * own order with its own single discount.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Nothing to price.' }, { status: 400 })

  const { items, unavailable } = await resolveCart(parsed.data.items)
  // A visitor who came by an affiliate's link sees that link's discount, as checkout applies it.
  const referral = await affiliateForCheckout()
  const held = await heldKeys(items, parsed.data.email)

  const groups = await Promise.all(
    groupByInterval(items.map((entry) => ({ ...entry, interval: entry.item.interval }))).map(async (group) => {
      const priced = await priceLines(group.items, parsed.data.code, referral?.offer ? [referral.offer] : [])
      return {
        interval: group.interval,
        currency: group.items[0].item.currency,
        lines: priced.lines.map((line) => ({
          key: line.key,
          kind: line.item.kind,
          name: line.item.name,
          listCents: line.listCents,
          chargeCents: line.chargeCents,
          discounted: line.offerId !== null,
        })),
        listCents: priced.listCents,
        chargeCents: priced.chargeCents,
        offerName: priced.offer?.name ?? null,
        percentOff: priced.offer?.percentOff ?? 0,
        codeApplied: priced.codeApplied,
      }
    }),
  )

  return NextResponse.json({ groups, unavailable, held })
}
