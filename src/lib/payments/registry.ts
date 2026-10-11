import 'server-only'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { configFrom, loadStored, type StoredGateway } from '@/lib/payments/gateway-settings'
import type { CustomGatewayRow, GatewayConfig, PaymentGateway } from '@/lib/payments/gateway-types'
import { cregisGateway } from '@/lib/payments/gateways/cregis'
import { makeCustomGateway } from '@/lib/payments/gateways/custom'
import { nowpaymentsGateway } from '@/lib/payments/gateways/nowpayments'
import { paypalGateway } from '@/lib/payments/gateways/paypal'
import { razorpayGateway } from '@/lib/payments/gateways/razorpay'
import { stripeGateway } from '@/lib/payments/gateways/stripe'
import { tapGateway } from '@/lib/payments/gateways/tap'
import { testGateway, testPaymentsAllowed } from '@/lib/payments/gateways/test'
import { DEFAULT_RULES, rankProviders, type RouteRule } from '@/lib/payments/routing-shape'

/** Providers written in code. Add a new one here; see gateways/_template.ts. */
const BUILT_IN: PaymentGateway[] = [
  stripeGateway,
  cregisGateway,
  razorpayGateway,
  tapGateway,
  paypalGateway,
  nowpaymentsGateway,
  testGateway,
]

export function builtInGateways(): PaymentGateway[] {
  return BUILT_IN
}

export function getGateway(id: string): PaymentGateway | undefined {
  return BUILT_IN.find((gateway) => gateway.id === id)
}

/**
 * Providers added on the Providers page without code.
 *
 * Empty, rather than an error, if the table is not there yet: the deploy that creates it
 * and the code that reads it can land in either order.
 */
export async function customGateways(): Promise<PaymentGateway[]> {
  let rows: CustomGatewayRow[] = []
  try {
    rows = await db.customGateway.findMany({ orderBy: { createdAt: 'asc' } })
  } catch (error) {
    console.error('[payments] could not read custom providers; treating as none', error)
    return []
  }
  const base = safeBase()
  return rows.map((row) => makeCustomGateway(row, base))
}

export async function everyGateway(): Promise<PaymentGateway[]> {
  return [...BUILT_IN, ...(await customGateways())]
}

export async function resolveGateway(id: string): Promise<PaymentGateway | undefined> {
  const builtIn = getGateway(id)
  if (builtIn) return builtIn
  if (!id.startsWith('custom-')) return undefined
  return (await customGateways()).find((gateway) => gateway.id === id)
}

export function hasKeys(gateway: PaymentGateway, cfg: GatewayConfig): boolean {
  return gateway.isConfigured
    ? gateway.isConfigured(cfg)
    : gateway.fields.every((field) => !field.required || Boolean(cfg.values[field.key]))
}

/** Can take a new payment: keys present and not paused by an admin. */
export function isReady(gateway: PaymentGateway, cfg: GatewayConfig): boolean {
  return cfg.enabled && hasKeys(gateway, cfg)
}

export type Connected = { gateway: PaymentGateway; cfg: GatewayConfig; stored: StoredGateway | undefined }

/** Several providers with their keys, in one settings read. */
export async function withConfigs(gateways: PaymentGateway[]): Promise<Connected[]> {
  const stored = await loadStored(gateways)
  return gateways.map((gateway) => ({ gateway, stored: stored.get(gateway.id), cfg: configFrom(gateway, stored.get(gateway.id)) }))
}

export async function gatewayConfig(id: string): Promise<GatewayConfig | null> {
  const gateway = await resolveGateway(id)
  if (!gateway) return null
  return (await withConfigs([gateway]))[0].cfg
}

/** A provider ready to take a new payment, with its keys — or null. */
export async function connect(id: string): Promise<Connected | null> {
  const gateway = await resolveGateway(id)
  if (!gateway) return null
  const [connected] = await withConfigs([gateway])
  return isReady(gateway, connected.cfg) ? connected : null
}

/**
 * A provider able to confirm a payment, with its keys — or null.
 *
 * Unlike `connect`, a paused provider still answers: pausing stops new checkouts, but a
 * buyer who paid a minute before the pause must still be given what they paid for.
 */
export async function connectForConfirmation(id: string): Promise<Connected | null> {
  const gateway = await resolveGateway(id)
  if (!gateway) return null
  const [connected] = await withConfigs([gateway])
  return hasKeys(gateway, connected.cfg) ? connected : null
}

/** The admin's rules, or the default of card then crypto when there are none. */
export async function routeRules(): Promise<{ rules: RouteRule[]; isDefault: boolean }> {
  let rows: RouteRule[] = []
  try {
    rows = await db.paymentRoute.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] })
  } catch (error) {
    console.error('[payments] could not read rules; using the default', error)
  }
  return rows.length ? { rules: rows, isDefault: false } : { rules: DEFAULT_RULES, isDefault: true }
}

/**
 * The providers a buyer in this country, paying in this currency, is offered — best first.
 *
 * Providers that are unknown, paused, missing keys or unable to charge the currency are
 * skipped. The test provider is added last while ALLOW_TEST_PAYMENTS=true, without a rule.
 */
export async function gatewaysFor(country: string | null, currency: string): Promise<PaymentGateway[]> {
  const [{ rules }, all] = await Promise.all([routeRules(), everyGateway()])
  const connected = new Map((await withConfigs(all)).map((entry) => [entry.gateway.id, entry]))
  const money = currency.toUpperCase()
  const usable = (id: string) => {
    const entry = connected.get(id)
    if (!entry) return false
    if (entry.gateway.currencies && !entry.gateway.currencies.includes(money)) return false
    return isReady(entry.gateway, entry.cfg)
  }
  const ids = rankProviders(rules, country, money, usable)
  if (testPaymentsAllowed() && !ids.includes(testGateway.id)) ids.push(testGateway.id)
  return ids.map((id) => connected.get(id)!.gateway)
}

/** The webhook URL a provider is told about. */
export function webhookUrl(gateway: PaymentGateway): string {
  return `${safeBase()}${gateway.webhookPath ?? `/api/webhooks/payments/${gateway.id}`}`
}

function safeBase(): string {
  try {
    return appBaseUrl()
  } catch {
    return ''
  }
}
