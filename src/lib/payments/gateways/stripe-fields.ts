import type { CredentialField } from '@/lib/payments/gateway-types'

/** Stripe's keys, shared by the client in stripe.ts and the provider card in stripe.ts here. */
export const STRIPE_FIELDS: CredentialField[] = [
  {
    key: 'secret_key',
    label: 'Secret key',
    secret: true,
    required: true,
    env: 'STRIPE_SECRET_KEY',
    placeholder: 'sk_live_… or a restricted rk_live_…',
  },
  {
    key: 'webhook_secret',
    label: 'Webhook signing secret',
    secret: true,
    required: true,
    env: 'STRIPE_WEBHOOK_SECRET',
    placeholder: 'whsec_…',
    help: 'Without it, payments succeed and nobody is given access.',
  },
]
