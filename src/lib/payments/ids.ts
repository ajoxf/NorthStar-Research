import type { PaymentProviderId } from '@/lib/payments/types'

/** The registered rails, in the order a buyer is offered them. Pure, so it can be tested. */
export const PAYMENT_PROVIDER_IDS = ['stripe', 'cregis'] as const satisfies readonly PaymentProviderId[]

export function isPaymentProviderId(value: unknown): value is PaymentProviderId {
  return PAYMENT_PROVIDER_IDS.includes(value as PaymentProviderId)
}

/**
 * The buyer-facing method names the checkout forms have always sent. Kept so a page loaded
 * before a deploy still checks out after it.
 */
export const METHOD_PROVIDER: Record<'card' | 'crypto', PaymentProviderId> = {
  card: 'stripe',
  crypto: 'cregis',
}
