import 'server-only'

import { type PackageShape, stripePriceMismatch } from '@/lib/package-shape'
import { archiveStripePrice, createStripePrice, stripeConfigured, stripePriceFacts } from '@/lib/stripe'

/**
 * Work out which Stripe Price a package should point at after a save.
 *
 * Three routes in, and the difference between them is who authored the price:
 *
 * 1. **Not sold by card** — nothing to resolve. Crypto-only, no Stripe object involved.
 * 2. **An ID was pasted** — the operator authored it in the Stripe dashboard, so it is
 *    verified against what the package advertises and the save is refused on a mismatch.
 *    Stripe bills what its own Price says; a package promising $299 against a $199 price
 *    would take the wrong amount and nothing else would notice.
 * 3. **Neither** — this app authors it. Stripe prices are immutable, so a new amount is a
 *    new Price; the old one is archived afterwards so the dashboard stays readable.
 *
 * Route 3 is the normal one, and is what lets an operator change the price by typing a
 * number. Route 2 exists because an operator with an existing price should not be forced
 * to abandon it.
 *
 * Returns the resolved ids, or a message explaining why the save cannot proceed.
 */
export type PriceResolution =
  | { ok: true; stripePriceId: string | null; stripeProductId: string | null }
  | { ok: false; error: string }

export async function resolveStripePrice(input: {
  sellByCard: boolean
  pastedPriceId?: string | null
  desired: Pick<PackageShape, 'priceCents' | 'currency' | 'interval'> & { name: string }
  current?: { stripePriceId: string | null; stripeProductId: string | null }
}): Promise<PriceResolution> {
  const current = input.current ?? { stripePriceId: null, stripeProductId: null }

  if (!input.sellByCard) {
    // The old price is left alone rather than archived: turning card sales off should be
    // reversible without losing the price everyone currently subscribed is billed on.
    return { ok: true, stripePriceId: null, stripeProductId: current.stripeProductId }
  }

  if (!stripeConfigured()) {
    return {
      ok: false,
      error:
        'Stripe is not configured on this deployment, so a card price cannot be created. Set ' +
        'STRIPE_SECRET_KEY in Vercel, or save this package as crypto-only for now.',
    }
  }

  if (input.pastedPriceId) {
    if (input.pastedPriceId === current.stripePriceId) {
      // Unchanged, but still re-checked: the price could have been archived or edited in
      // the Stripe dashboard since it was last saved.
      const problem = await checkPrice(input.pastedPriceId, input.desired)
      return problem ? { ok: false, error: problem } : { ok: true, ...current }
    }

    const problem = await checkPrice(input.pastedPriceId, input.desired)
    if (problem) return { ok: false, error: problem }
    return { ok: true, stripePriceId: input.pastedPriceId, stripeProductId: current.stripeProductId }
  }

  // Nothing pasted. If the price we already own still matches what is being saved, keep
  // it — re-creating an identical price on every unrelated edit would litter the Stripe
  // account with duplicates.
  if (current.stripePriceId) {
    const problem = await checkPrice(current.stripePriceId, input.desired)
    if (!problem) return { ok: true, ...current }
  }

  try {
    const created = await createStripePrice({
      priceCents: input.desired.priceCents,
      currency: input.desired.currency,
      interval: input.desired.interval,
      productName: input.desired.name,
      productId: current.stripeProductId,
    })

    // Only after the new one exists. Archiving first would leave a window with no
    // sellable price at all if the create then failed.
    if (current.stripePriceId && current.stripePriceId !== created.priceId) {
      await archiveStripePrice(current.stripePriceId)
    }

    return { ok: true, stripePriceId: created.priceId, stripeProductId: created.productId }
  } catch (error) {
    return {
      ok: false,
      error: `Stripe would not create that price: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

async function checkPrice(
  priceId: string,
  desired: Pick<PackageShape, 'priceCents' | 'currency' | 'interval'>,
): Promise<string | null> {
  try {
    return stripePriceMismatch(desired, await stripePriceFacts(priceId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No such price')) {
      return (
        'Stripe does not recognise that price ID. Check it belongs to this account, and to the ' +
        'same live/test mode as the secret key.'
      )
    }
    // "Could not check" is not "it is fine" — the cost of guessing wrong is a mischarge.
    return `Stripe could not confirm that price: ${message}`
  }
}
