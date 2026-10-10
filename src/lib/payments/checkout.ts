import 'server-only'

import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import { heldKeys, priceLines, resolveCart } from '@/lib/cart'
import { CART_MAX_ITEMS } from '@/lib/cart-shape'
import { amountString } from '@/lib/package-shape'
import { CregisError } from '@/lib/payments/cregis'
import { refuseExistingMembership } from '@/lib/payments/checkout-rules'
import { getPaymentProvider } from '@/lib/payments/index'
import { CheckoutRefusal, type PaymentProviderId } from '@/lib/payments/types'

/** What the buyer asked for, before anything is looked up. */
export type CheckoutTarget = { kind: 'section'; id: string } | { kind: 'package'; id?: string | null }

/**
 * Start a checkout for one or more items through one rail.
 *
 * The single path every purchase takes, whichever rail it uses: resolve and price the
 * items, refuse what should be refused, record the order with one line per item, then hand
 * over to the rail. One order is one billing period and one currency — Stripe Checkout
 * cannot mix monthly and yearly in a subscription, and a crypto payment buys one period —
 * so a cart holding both is checked out as two orders, one per group.
 *
 * The order is written **before** the rail is called, on every rail. A callback can then
 * always find the order it belongs to, and a rail that fails leaves a row marked `failed`
 * rather than nothing — so an operator can see an attempt that went wrong.
 */
export async function startCheckout(input: {
  providerId: PaymentProviderId
  email: string
  phoneNumber?: string | null
  items: CheckoutTarget[]
  offerCode?: string
}): Promise<{ checkoutUrl: string; orderId: string }> {
  const provider = getPaymentProvider(input.providerId)
  const email = input.email.trim().toLowerCase()

  if (!(await provider.configured())) {
    throw new CheckoutRefusal(
      `${provider.label} payment is not available yet. Nothing has been charged.`,
      409,
    )
  }
  if (input.items.length === 0) throw new CheckoutRefusal('Your cart is empty. Nothing has been charged.', 400)
  if (input.items.length > CART_MAX_ITEMS) {
    throw new CheckoutRefusal(`A cart holds at most ${CART_MAX_ITEMS} items. Nothing has been charged.`, 400)
  }

  const { items, unavailable } = await resolveCart(
    input.items.map((target) => ({ kind: target.kind, id: target.id ?? '' })),
  )
  if (unavailable.length > 0 || items.length === 0) {
    throw new CheckoutRefusal(
      unavailable.length === 1 && input.items.length === 1
        ? 'That is not on sale. Nothing has been charged.'
        : 'Something in your cart is no longer on sale. Remove it and try again — nothing has been charged.',
      404,
    )
  }

  const intervals = new Set(items.map(({ item }) => item.interval))
  const currencies = new Set(items.map(({ item }) => item.currency))
  if (intervals.size > 1) {
    throw new CheckoutRefusal(
      'Monthly and yearly items are paid for separately. Check out one group at a time — nothing has been charged.',
      409,
    )
  }
  if (currencies.size > 1) {
    throw new CheckoutRefusal('These items are priced in different currencies. Check them out separately — nothing has been charged.', 409)
  }

  for (const { item } of items) {
    const reason = provider.canSell(item)
    if (reason) throw new CheckoutRefusal(items.length > 1 ? `${item.name}: ${reason}` : reason, 409)
  }

  const priced = await priceLines(items, input.offerCode)

  const held = await heldKeys(items, email)
  if (held.length > 0) {
    const names = priced.lines.filter((line) => held.includes(line.key)).map((line) => line.item.name)
    throw new CheckoutRefusal(
      names.length === 1
        ? `You already subscribe to ${names[0]}. Sign in to read it.`
        : `You already subscribe to ${names.join(' and ')}. Remove them from your cart — nothing has been charged.`,
      409,
    )
  }

  const member = await db.member.findUnique({
    where: { email },
    select: { passwordHash: true, subscriptionStatus: true },
  })
  if (
    items.some(({ item }) => item.kind === 'package') &&
    refuseExistingMembership(
      provider.capabilities,
      member ? { hasPassword: Boolean(member.passwordHash), subscriptionStatus: member.subscriptionStatus } : null,
    )
  ) {
    throw new CheckoutRefusal('That email already has an active membership. Sign in instead.', 409)
  }

  const single = priced.lines.length === 1 ? priced.lines[0].item : null
  const order = await db.checkoutOrder.create({
    data: {
      // Replaced by the rail's own reference as soon as it answers. The column predates a
      // second rail, hence the name; it holds a Stripe session id for card orders too.
      cregisOrderId: `pending_${crypto.randomUUID()}`,
      provider: provider.id,
      email,
      phoneNumber: input.phoneNumber ?? null,
      amount: amountString(priced.chargeCents),
      // The integer the ledger should read, rather than parsing `amount` back. See the
      // "related gap" note in docs/build-brief-v2.md §1.
      grossCents: priced.chargeCents,
      currency: priced.lines[0].item.currency,
      // The single-item columns, kept for a one-line order so every screen that reads them
      // still does. A basket of several is described by its lines alone.
      sectionId: single?.kind === 'section' ? single.id : null,
      packageId: single?.kind === 'package' ? single.id : null,
      offerId: priced.offer?.id ?? null,
      status: 'pending',
      lines: {
        create: priced.lines.map((line, position) => ({
          position,
          kind: line.item.kind === 'section' ? 'section' : line.item.id ? 'package' : 'plan',
          sectionId: line.item.kind === 'section' ? line.item.id : null,
          packageId: line.item.kind === 'package' ? line.item.id : null,
          name: line.item.name,
          interval: line.item.interval,
          listCents: line.listCents,
          chargeCents: line.chargeCents,
          offerId: line.offerId,
          authorId: line.item.authorId,
        })),
      },
    },
  })

  try {
    const result = await provider.startCheckout({
      orderId: order.id,
      email,
      lines: priced.lines.map((line) => ({
        item: line.item,
        listCents: line.listCents,
        chargeCents: line.chargeCents,
        offerApplied: line.offerId !== null,
      })),
      chargeCents: priced.chargeCents,
      offer: priced.offer,
    })
    await db.checkoutOrder.update({
      where: { id: order.id },
      data: { cregisOrderId: result.providerRef },
    })
    return { checkoutUrl: result.checkoutUrl, orderId: order.id }
  } catch (error) {
    await db.checkoutOrder.update({ where: { id: order.id }, data: { status: 'failed' } })
    throw error
  }
}

/**
 * The response for a checkout that did not start. Every message ends by saying nothing was
 * charged, because that is the first thing a buyer looking at an error wants to know.
 */
export function checkoutErrorResponse(error: unknown, tag: string): NextResponse {
  if (error instanceof CheckoutRefusal) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof MissingConfigError) {
    console.error(`[${tag}] ${error.message}`)
    return NextResponse.json(
      { error: 'Payment is not configured yet. Nothing has been charged.', missingConfig: error.keys },
      { status: 503 },
    )
  }
  if (error instanceof CregisError) {
    console.error(`[${tag}] ${error.message}`)
    return NextResponse.json(
      { error: 'The payment service rejected this request. Please try again shortly — nothing has been charged.' },
      { status: 502 },
    )
  }
  console.error(`[${tag}] failed`, error)
  return NextResponse.json(
    { error: 'Could not start checkout. Please try again shortly — nothing has been charged.' },
    { status: 502 },
  )
}
