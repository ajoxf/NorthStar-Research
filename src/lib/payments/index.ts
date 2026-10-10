import 'server-only'

import { cregisProvider } from '@/lib/payments/cregis-provider'
import { stripeProvider } from '@/lib/payments/stripe-provider'
import type { PaymentProvider, PaymentProviderId } from '@/lib/payments/types'
import { PAYMENT_PROVIDER_IDS } from '@/lib/payments/ids'

export * from '@/lib/payments/types'
export { PAYMENT_PROVIDER_IDS, isPaymentProviderId } from '@/lib/payments/ids'

/**
 * Every rail this deployment knows how to take money through.
 *
 * Adding one is a file implementing `PaymentProvider` and a line here — plus its id in
 * ids.ts and, if it is new to the database, the `BillingProvider` enum.
 */
const PROVIDERS = {
  stripe: stripeProvider,
  cregis: cregisProvider,
} satisfies Record<PaymentProviderId, PaymentProvider<unknown>>

export function getPaymentProvider<Id extends PaymentProviderId>(id: Id): (typeof PROVIDERS)[Id] {
  return PROVIDERS[id]
}

/**
 * Which rails can take money right now, asked of each rail.
 *
 * The one place a page should learn whether to offer a payment method. Asking the rail
 * rather than reading environment variables directly matters: Cregis can be configured
 * from the console, and a page that read only the environment would hide a crypto option
 * that works.
 */
export async function paymentAvailability(): Promise<Record<PaymentProviderId, boolean>> {
  const entries = await Promise.all(
    PAYMENT_PROVIDER_IDS.map(async (id) => [id, await PROVIDERS[id].configured()] as const),
  )
  return Object.fromEntries(entries) as Record<PaymentProviderId, boolean>
}
