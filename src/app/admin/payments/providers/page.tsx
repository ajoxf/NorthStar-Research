import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import {
  AddProvider,
  ProviderCard,
  RoutingChecker,
  RulesTable,
  type ProviderView,
  type RuleView,
} from '@/app/admin/payments/providers/providers-client'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { fieldStates } from '@/lib/payments/gateway-settings'
import { PAY_URL_PLACEHOLDERS } from '@/lib/payments/gateways/custom'
import { testPaymentsAllowed } from '@/lib/payments/gateways/test'
import { everyGateway, hasKeys, routeRules, webhookUrl, withConfigs } from '@/lib/payments/registry'

export const metadata: Metadata = { title: 'Payment providers', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const FUTURE = [
  { name: 'Telr', where: 'UAE and Saudi Arabia: cards, mada, Apple Pay' },
  { name: 'Network International (N-Genius)', where: 'UAE and the Gulf: cards from the region’s banks' },
  { name: 'Checkout.com', where: 'Worldwide cards, strong in the Gulf' },
  { name: 'PayTabs', where: 'Saudi Arabia, UAE, Egypt: mada, cards, Apple Pay' },
  { name: 'Paymob', where: 'Egypt and Pakistan: cards and wallets' },
  { name: 'Coinbase Commerce', where: 'Crypto worldwide' },
  { name: 'Binance Pay', where: 'Crypto, for Binance users' },
  { name: 'BitPay', where: 'Bitcoin and stablecoins' },
]

/**
 * Payment providers, their keys, and which buyers see which.
 *
 * Built for an owner, not a developer: keys are pasted and tested here, providers are added
 * without code, and "rules" — not routes — decide what each buyer is offered. Nothing here
 * sends a saved secret back to the browser: a card is told only "saved ••••4f2a".
 */
export default async function ProvidersPage() {
  await requireAdmin()

  // The test provider is listed only while it is switched on; otherwise it is noise.
  const gateways = (await everyGateway()).filter((gateway) => gateway.id !== 'test' || testPaymentsAllowed())
  const [connected, { rules, isDefault }] = await Promise.all([withConfigs(gateways), routeRules()])

  const providers: ProviderView[] = connected.map(({ gateway, cfg, stored }) => {
    const states = fieldStates(gateway, stored)
    return {
      id: gateway.id,
      name: gateway.name,
      label: gateway.label,
      regions: gateway.regions,
      keysHelp: gateway.keysHelp,
      webhookUrl: gateway.id === 'test' ? null : webhookUrl(gateway),
      webhookEvents: gateway.webhookEvents,
      webhookNote: gateway.webhookNote ?? null,
      hasTest: Boolean(gateway.testConnection),
      status: !cfg.enabled ? 'paused' : hasKeys(gateway, cfg) ? 'ready' : 'missing',
      unreadable: Object.values(states).some((state) => state.unreadable),
      hasSaved: Object.values(states).some((state) => state.source === 'saved' || state.unreadable),
      canPause: gateway.id !== 'test',
      fields: gateway.fields.map((field) => ({
        key: field.key,
        label: field.label,
        secret: field.secret,
        required: field.required,
        options: field.options ?? null,
        placeholder: field.placeholder ?? null,
        help: field.help ?? null,
        env: field.env ?? null,
        state: states[field.key],
      })),
      custom: gateway.custom
        ? {
            name: gateway.custom.name,
            label: gateway.custom.label,
            payUrl: gateway.custom.payUrl ?? '',
            instructions: gateway.custom.instructions ?? '',
            currencies: gateway.custom.currencies.join(', '),
          }
        : null,
    }
  })

  const names = new Map(gateways.map((gateway) => [gateway.id, gateway.name]))
  const ruleViews: RuleView[] = isDefault
    ? []
    : rules.map((rule) => ({
        id: (rule as { id?: string }).id ?? '',
        country: rule.countryCode,
        currency: rule.currency,
        gateway: rule.gateway,
        gatewayName: names.get(rule.gateway) ?? `${rule.gateway} (removed)`,
        priority: rule.priority,
        isActive: rule.isActive,
      }))
  const options = gateways.filter((gateway) => gateway.id !== 'test').map((gateway) => ({ id: gateway.id, name: gateway.name }))

  return (
    <ToastProvider>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-5 sm:py-12">
        <Link
          href="/admin/payments"
          className="mb-6 flex w-fit items-center gap-1.5 font-mono text-[14px] text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Payments
        </Link>

        <span className="eyebrow">Money in</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Payment providers</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-ink-dim">
          Buyers are sent to a provider by their billing country and the currency they pay in. The most specific rule
          wins, and a provider that is paused or has no keys is skipped automatically — so a buyer is never shown a way
          to pay that cannot take their money.
        </p>

        {testPaymentsAllowed() && (
          <div className="mt-6 rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-[16px] leading-relaxed text-ink">
            <strong>Test payments are on.</strong> Every buyer is offered &ldquo;Test payment&rdquo;, which gives access
            without taking money. Remove <code className="font-mono text-[15px]">ALLOW_TEST_PAYMENTS</code> in Vercel
            before taking real payments.
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-[22px] text-ink">Payment providers &amp; API keys</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} placeholders={[...PAY_URL_PLACEHOLDERS]} />
            ))}
            <AddProvider placeholders={[...PAY_URL_PLACEHOLDERS]} />
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            Secret keys are encrypted before they are stored and are never shown again. Only admins can change them, and
            every change is recorded in the audit log.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-[22px] text-ink">Which provider each buyer sees</h2>
          <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-ink-dim">
            Each rule says: buyers in this country, paying in this currency, are offered this provider. Leave country or
            currency blank to match any. When several rules match, the most specific comes first — country and currency,
            then country, then currency, then any — and a lower priority number breaks a tie. A buyer chooses between
            everything that matches.
          </p>
          <RulesTable rules={ruleViews} isDefault={isDefault} options={options} />
        </section>

        <section className="mt-12">
          <h2 className="text-[22px] text-ink">Check what a buyer sees</h2>
          <RoutingChecker />
        </section>

        <section className="mt-12">
          <h2 className="text-[22px] text-ink">Fully automatic integrations we can add</h2>
          <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-ink-dim">
            Each of these confirms payments by itself once built in. Until then, any of them can be added above as a
            payment-link provider and confirmed with &ldquo;Mark as paid&rdquo;.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {FUTURE.map((entry) => (
              <li key={entry.name} className="rounded-lg border border-line px-4 py-3">
                <span className="block text-[16px] text-ink">{entry.name}</span>
                <span className="block text-[14px] text-ink-dim">{entry.where}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ToastProvider>
  )
}
