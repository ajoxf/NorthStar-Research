import type { PaymentGateway } from '@/lib/payments/gateway-types'
import { CREGIS_SETTING_KEYS } from '@/lib/cregis-settings'

/**
 * Cregis, as the Providers page sees it. Its checkout and callback are the crypto rail in
 * cregis.ts and cregis-provider.ts. Its keys are stored under the names they have always
 * had, so values saved on the old settings form carry over untouched.
 *
 * No connection test: Cregis has no read-only endpoint to call — the only way to prove the
 * keys is a real order, which the "Test a payment" button on Payment settings makes.
 */
export const cregisGateway: PaymentGateway = {
  id: 'cregis',
  name: 'Cregis',
  label: 'Pay with crypto',
  regions: 'Crypto worldwide (USDT and others). One period per payment.',
  keysHelp: 'Cregis → Developer Center → your project: the project ID and API key, and the API host they gave you.',
  webhookEvents: [],
  webhookPath: '/api/webhooks/cregis',
  webhookNote: 'Nothing to register: this callback URL is sent with every payment.',
  fields: [
    { key: 'project_id', label: 'Project ID', secret: false, required: true, env: 'CREGIS_PROJECT_ID', storageKey: CREGIS_SETTING_KEYS.projectId },
    { key: 'api_key', label: 'API key', secret: true, required: true, env: 'CREGIS_API_KEY', storageKey: CREGIS_SETTING_KEYS.apiKey },
    {
      key: 'base_url',
      label: 'API base URL',
      secret: false,
      required: true,
      env: 'CREGIS_BASE_URL',
      storageKey: CREGIS_SETTING_KEYS.baseUrl,
      placeholder: 'https://…',
    },
    {
      key: 'callback_ips',
      label: 'Callback IP allowlist',
      secret: false,
      required: false,
      storageKey: CREGIS_SETTING_KEYS.callbackIps,
      help: 'Optional. Leave blank unless Cregis has confirmed a fixed list — a missing address would turn real payments away.',
    },
  ],
  currencies: null,
  rail: 'cregis',
}
