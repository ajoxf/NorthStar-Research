import 'server-only'

import { type PackageShape, stripePriceMismatch } from '@/lib/package-shape'
import { stripeConfigured, stripePriceFacts } from '@/lib/stripe'

/**
 * Ask Stripe whether a price id really is what the package claims it is.
 *
 * Returns the reason to refuse the save, or null to allow it.
 *
 * Two cases are deliberately allowed through:
 *
 * - **Stripe is not configured at all.** Then no card checkout can happen anyway, and
 *   blocking package creation would mean an operator could not set up pricing before
 *   wiring up billing. The payment settings page already reports Stripe as unconfigured.
 * - Nothing else. A price that Stripe rejects, or that does not match, is refused —
 *   including when the API call itself fails, because "we could not check" is not the
 *   same as "it is fine", and the cost of guessing wrong here is a mischarged buyer.
 */
export async function verifyPackagePrice(
  priceId: string,
  pkg: Pick<PackageShape, 'priceCents' | 'currency' | 'interval'>,
): Promise<string | null> {
  if (!stripeConfigured()) return null

  try {
    const facts = await stripePriceFacts(priceId)
    return stripePriceMismatch(pkg, facts)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No such price')) {
      return (
        'Stripe does not recognise that price ID. Check it belongs to this account, and to the ' +
        'same live/test mode as the secret key.'
      )
    }
    return `Stripe could not confirm that price: ${message}`
  }
}
