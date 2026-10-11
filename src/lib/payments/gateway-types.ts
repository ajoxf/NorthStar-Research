/**
 * The provider interface the admin Providers page configures, and checkout routes buyers to.
 *
 * Two kinds of provider sit behind it:
 *
 * - **Rails** — Stripe and Cregis — which predate it and keep their own checkout and webhook
 *   code (see types.ts and the two webhook routes). Stripe renews card subscriptions by
 *   itself, which nothing else here does. They appear here so an admin can enter their
 *   keys, pause them and route buyers to them like any other provider; `rail` names them.
 * - **One-period providers** — everything else, including payment-link providers added
 *   without code. Each takes one payment for one period, like crypto: the buyer is reminded
 *   before it ends and pays again. They implement `createCheckout` and `parseWebhook`, and
 *   are confirmed through `applyGatewayEvents`.
 *
 * Adding a provider is one file in gateways/ and a line in registry.ts. Nothing outside
 * src/lib/payments imports a provider's SDK or calls its API.
 */

/** What a one-period provider needs to open a payment. Amounts are minor units. */
export type CheckoutInput = {
  orderId: string
  /** The human reference, NS-{orderNumber}. */
  orderNumber: number
  /** ISO 4217, upper case. */
  currency: string
  totalMinor: number
  lines: { title: string; amountMinor: number; quantity: number }[]
  customer: { email: string; name?: string | null; country?: string | null }
  successUrl: string
  cancelUrl: string
  webhookUrl: string
}

/** Something a provider told us, verified. `orderId` may be "#1234", an order number. */
export type GatewayEvent =
  | { type: 'payment.succeeded'; eventId: string; orderId: string; sessionId?: string; raw: unknown }
  | { type: 'payment.failed'; eventId: string; orderId: string; raw: unknown }
  | { type: 'refund.succeeded'; eventId: string; orderId: string; refundId: string; amountMinor: number; raw: unknown }
  | { type: 'ignored'; eventId: string; raw: unknown }

export type CredentialField = {
  key: string
  label: string
  /** Encrypted, write-only: never sent back to a browser once saved. */
  secret: boolean
  required: boolean
  /** The environment variable used when nothing is saved for this field. */
  env?: string
  placeholder?: string
  /** A choice rather than free text — "sandbox" or "live". */
  options?: string[]
  help?: string
  /**
   * Where this field is stored, when it predates this page — Cregis's keys were already
   * saved under their own names, and keep working from there. Default: gateway.{id}.{key}.
   */
  storageKey?: string
}

export type GatewayConfig = { values: Record<string, string>; enabled: boolean }

/** A provider an admin added without code. */
export type CustomGatewayRow = {
  id: string
  name: string
  label: string
  instructions: string | null
  payUrl: string | null
  currencies: string[]
}

export interface PaymentGateway {
  /** Used in rules, on orders, and in the webhook URL /api/webhooks/payments/{id}. */
  id: string
  /** For admins. */
  name: string
  /** The button text buyers see. */
  label: string
  /** One line for the admin screen: where it is used. */
  regions: string
  /** Where to find the keys in the provider's own dashboard. */
  keysHelp: string
  /** The events an admin must tick when registering the webhook. */
  webhookEvents: string[]
  /** When the webhook is not the generic route: Stripe's and Cregis's predate it. */
  webhookPath?: string
  /** Set when nothing needs registering — the URL travels with each payment. */
  webhookNote?: string
  fields: CredentialField[]
  /** Upper case. Null charges any currency. */
  currencies: string[] | null
  /** Renews by itself. Only Stripe. */
  recurring?: boolean
  /** A rail with its own checkout and webhook; see the note at the top. */
  rail?: 'stripe' | 'cregis'
  /** Default: every required field present. */
  isConfigured?(cfg: GatewayConfig): boolean
  createCheckout?(input: CheckoutInput, cfg: GatewayConfig): Promise<{ sessionId: string; redirectUrl: string }>
  /** Must verify a signature or re-fetch from the provider. A body is never trusted. */
  parseWebhook?(request: Request, cfg: GatewayConfig): Promise<GatewayEvent[]>
  /** Ask the provider directly when the buyer returns. */
  verify?(input: { orderId: string; sessionId: string }, cfg: GatewayConfig): Promise<GatewayEvent[]>
  refund?(
    input: { orderId: string; sessionId: string; amountMinor: number; currency: string },
    cfg: GatewayConfig,
  ): Promise<{ refundId: string }>
  /** A harmless call. Resolves to "Connected to … in test mode"; throws the provider's own error. */
  testConnection?(cfg: GatewayConfig): Promise<string>
  custom?: CustomGatewayRow
}
