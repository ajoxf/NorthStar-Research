import 'server-only'

import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import { priceWithOffer } from '@/lib/offer'
import { offerForCheckout } from '@/lib/offers'
import { amountString, isFallbackPackage } from '@/lib/package-shape'
import { packageForCheckout } from '@/lib/packages'
import { CregisError } from '@/lib/payments/cregis'
import { alreadyHoldsSection, refuseExistingMembership } from '@/lib/payments/checkout-rules'
import { getPaymentProvider } from '@/lib/payments/index'
import { CheckoutRefusal, type CheckoutItem, type PaymentProviderId } from '@/lib/payments/types'
import { sectionName } from '@/lib/section-shape'

/** What the buyer asked for, before anything is looked up. */
export type CheckoutTarget = { kind: 'section'; id: string } | { kind: 'package'; id?: string | null }

/**
 * Start a checkout for one item through one rail.
 *
 * The single path every purchase takes, whichever rail it uses: resolve and price the item,
 * refuse what should be refused, record the order, then hand over to the rail. It replaces
 * three routes that each did all of this with their rail baked in.
 *
 * The order is written **before** the rail is called, on every rail. A callback can then
 * always find the order it belongs to, and a rail that fails leaves a row marked `failed`
 * rather than nothing — so an operator can see an attempt that went wrong.
 */
export async function startCheckout(input: {
  providerId: PaymentProviderId
  email: string
  phoneNumber?: string | null
  target: CheckoutTarget
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

  const item = await resolveItem(input.target)

  const reason = provider.canSell(item)
  if (reason) throw new CheckoutRefusal(reason, 409)

  // Offers are scoped to a section or a package row; the built-in plan has neither.
  const offer =
    item.kind === 'section'
      ? await offerForCheckout({ sectionId: item.id }, input.offerCode)
      : item.id
        ? await offerForCheckout({ packageId: item.id }, input.offerCode)
        : null
  const priced = priceWithOffer(item.priceCents, offer)

  const member = await db.member.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, subscriptionStatus: true },
  })

  if (item.kind === 'section' && member) {
    const held = await db.entitlement.findUnique({
      where: { memberId_sectionId: { memberId: member.id, sectionId: item.id } },
      select: { status: true, renewsAt: true },
    })
    if (alreadyHoldsSection(held)) {
      throw new CheckoutRefusal(`You already subscribe to ${item.name}. Sign in to read it.`, 409)
    }
  }

  if (
    item.kind === 'package' &&
    refuseExistingMembership(
      provider.capabilities,
      member
        ? { hasPassword: Boolean(member.passwordHash), subscriptionStatus: member.subscriptionStatus }
        : null,
    )
  ) {
    throw new CheckoutRefusal('That email already has an active membership. Sign in instead.', 409)
  }

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
      currency: item.currency,
      sectionId: item.kind === 'section' ? item.id : null,
      packageId: item.kind === 'package' ? item.id : null,
      offerId: priced.offerId,
      status: 'pending',
      /*
       * The line, written with the order. One today; the cart writes several. Fulfilment,
       * attribution and refunds read lines, so every new order has them from the start.
       */
      lines: {
        create: [
          {
            position: 0,
            kind: item.kind === 'section' ? 'section' : item.id ? 'package' : 'plan',
            sectionId: item.kind === 'section' ? item.id : null,
            packageId: item.kind === 'package' ? item.id : null,
            name: item.name,
            interval: item.interval,
            listCents: priced.listCents,
            chargeCents: priced.chargeCents,
            offerId: priced.offerId,
            authorId: item.authorId,
          },
        ],
      },
    },
  })

  try {
    const result = await provider.startCheckout({
      orderId: order.id,
      email,
      item,
      chargeCents: priced.chargeCents,
      offer,
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

async function resolveItem(target: CheckoutTarget): Promise<CheckoutItem> {
  if (target.kind === 'section') {
    const section = await db.section.findUnique({
      where: { id: target.id },
      include: { topic: true, author: true },
    })
    if (!section || section.archivedAt !== null) {
      throw new CheckoutRefusal('That section is not on sale. Nothing has been charged.', 404)
    }
    return {
      kind: 'section',
      id: section.id,
      name: sectionName(section),
      priceCents: section.priceCents,
      currency: section.currency,
      interval: section.interval,
      stripePriceId: section.stripePriceId,
      stripeProductId: section.stripeProductId,
      authorId: section.authorId,
    }
  }

  const pkg = await packageForCheckout(target.id)
  return {
    kind: 'package',
    id: isFallbackPackage(pkg) ? null : pkg.id,
    name: pkg.name,
    priceCents: pkg.priceCents,
    currency: pkg.currency,
    interval: pkg.interval,
    stripePriceId: pkg.stripePriceId,
    authorId: pkg.authorId,
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
