import type { BillingInterval } from '@prisma/client'

import type { OfferShape } from '@/lib/offer'

/**
 * The seam every payment rail plugs into.
 *
 * Everything that takes money from a buyer goes through this interface. Nothing outside
 * `src/lib/payments/` imports Stripe, Cregis, or any other vendor SDK — a test enforces it
 * (payments-boundary.test.ts). Adding a rail means writing one file that implements
 * `PaymentProvider` and registering it in `index.ts`, the same shape as
 * `getNotificationProvider()` in src/lib/notifications.
 *
 * Deliberately small. It was shaped against the two rails that exist rather than an
 * imagined third, and grows when a real one is signed — not before.
 */

/** Matches the `BillingProvider` enum, minus `manual`, which is not a rail anybody pays through. */
export type PaymentProviderId = 'stripe' | 'cregis'

/**
 * What a rail can do, declared by the rail rather than inferred by its callers.
 *
 * The rails genuinely differ: Stripe stores a card and re-charges it, Cregis takes a
 * one-off push of crypto with nothing behind it to charge again. Code that needs to know
 * asks here, rather than branching on a provider's name.
 */
export type PaymentCapabilities = {
  /** Charges again by itself each period until cancelled. */
  recurring: boolean
  /** Settles in crypto-assets. */
  crypto: boolean
  /** Can return money through an API call. Neither rail does this from the app yet. */
  refunds: boolean
  /** Can send money to an expert or affiliate. Neither rail does this from the app yet. */
  payouts: boolean
}

/** What is being bought, already resolved and priced by the caller. */
export type CheckoutItem =
  | {
      kind: 'section'
      id: string
      name: string
      priceCents: number
      currency: string
      interval: BillingInterval
      stripePriceId: string | null
      stripeProductId: string | null
      /** The subject matter expert who writes it. Snapshotted onto the order line. */
      authorId: string
    }
  | {
      kind: 'package'
      /** Null for the built-in plan, which predates packages and has no row. */
      id: string | null
      name: string
      priceCents: number
      currency: string
      interval: BillingInterval
      stripePriceId: string | null
      /** A package has at most one expert; null is house revenue. */
      authorId: string | null
    }

/** One line of an order, as a rail needs it. */
export type StartCheckoutLine = {
  item: CheckoutItem
  listCents: number
  /** What this line is charged, after the order's offer if it covers this line. */
  chargeCents: number
  /** Whether the order's offer covers this line. */
  offerApplied: boolean
}

export type StartCheckoutInput = {
  /** Our CheckoutOrder id, created before the rail is called so a callback can always find it. */
  orderId: string
  email: string
  /** One or more lines, all on the same billing period and currency — see checkout.ts. */
  lines: StartCheckoutLine[]
  /** The order total: the sum of the lines' charges. Always what the order records. */
  chargeCents: number
  /** The order's one offer, if any. A rail that discounts natively (Stripe) needs it. */
  offer: OfferShape | null
}

export type StartCheckoutResult = {
  /** Where to send the buyer. */
  checkoutUrl: string
  /** The rail's own reference for this checkout, matched again when its callback arrives. */
  providerRef: string
}

/** A webhook, verified or refused. Refusals carry the status the route should answer with. */
export type WebhookVerification<Event> =
  | { ok: true; event: Event }
  | { ok: false; status: number; error: string }

export interface PaymentProvider<Event = unknown> {
  readonly id: PaymentProviderId
  /** How a buyer would name it: "Card", "Crypto". */
  readonly label: string
  readonly capabilities: PaymentCapabilities

  /** Whether this deployment can take money through this rail right now. */
  configured(): Promise<boolean>

  /**
   * Whether this rail can sell this particular item, or why not.
   *
   * Separate from `configured`: Stripe can be fully set up and still be unable to sell a
   * package that has no Stripe Price yet. The reason is shown to the buyer, so it says
   * what to do instead and that nothing has been charged.
   */
  canSell(item: CheckoutItem): string | null

  /** Open one hosted checkout for an order's lines. Throws on failure; see checkout.ts for the mapping. */
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>

  /**
   * Stop a recurring subscription charging for what was refunded: remove the items for
   * these products, or end the subscription when `all` — or when nothing else would be
   * left on it. Only rails that bill on repeat implement this; a one-off rail has nothing
   * to stop. Throws if the rail cannot be reached, so the caller can say so.
   */
  stopRenewal?(subscriptionRef: string, productIds: string[] | 'all'): Promise<'cancelled' | 'removed' | 'nothing'>

  /** Authenticate an inbound callback from this rail. Never trust a payload this refused. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification<Event>>
}

/**
 * A refusal the buyer should read, with the status to send it under.
 *
 * Thrown by a provider (or the shared checkout) when the answer is "no" rather than
 * "something broke" — the difference between telling somebody to choose crypto and
 * telling them to try again later.
 */
export class CheckoutRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CheckoutRefusal'
  }
}
