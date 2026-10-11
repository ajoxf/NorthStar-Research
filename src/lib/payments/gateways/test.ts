import type { PaymentGateway } from '@/lib/payments/gateway-types'

/** Whether the test provider may be offered at all. Never set this in production. */
export function testPaymentsAllowed(): boolean {
  return process.env.ALLOW_TEST_PAYMENTS === 'true'
}

/**
 * A provider that moves no money, for trying checkout end to end. Offered only while
 * ALLOW_TEST_PAYMENTS=true; the Providers page shows a warning the whole time it is.
 *
 * The buyer lands on the success page with a "Simulate payment" button, which confirms the
 * order through the same path a real provider's webhook takes.
 */
export const testGateway: PaymentGateway = {
  id: 'test',
  name: 'Test payments',
  label: 'Test payment (no money moves)',
  regions: 'Testing only. No money moves.',
  keysHelp: 'Turned on by ALLOW_TEST_PAYMENTS=true in Vercel. Remove it before taking real payments.',
  webhookEvents: [],
  webhookNote: 'Nothing to set up: the success page confirms test payments itself.',
  fields: [],
  currencies: null,
  isConfigured: () => testPaymentsAllowed(),

  async createCheckout(input) {
    const separator = input.successUrl.includes('?') ? '&' : '?'
    return { sessionId: `test_${input.orderId}`, redirectUrl: `${input.successUrl}${separator}simulate=1` }
  },

  async parseWebhook() {
    // Confirmed by the success page's simulate button, never by a request from outside.
    return []
  },
}
