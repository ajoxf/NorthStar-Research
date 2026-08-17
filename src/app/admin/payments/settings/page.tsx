import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { CopyableUrl, PaymentChecks } from '@/app/admin/payments/settings/payment-checks'
import { CregisForm, type CregisFormState } from '@/app/admin/payments/settings/cregis-form'
import { PricingForm, type PricingState } from '@/app/admin/payments/settings/pricing-form'
import { TestPayments, type TestState } from '@/app/admin/payments/settings/test-payments'
import { CREGIS_SETTING_KEYS, resolveCregisSettings } from '@/lib/cregis-settings'
import { settingsMetadata } from '@/lib/secure-settings'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { cregisConfigured } from '@/lib/cregis'
import { stripeConfigured } from '@/lib/stripe'
import { isFallbackPackage, priceLine } from '@/lib/package-shape'
import { defaultPackage, sellablePackages } from '@/lib/packages'
import { CANONICAL_BASE_URL } from '@/lib/env'
import {
  REQUIRED_STRIPE_EVENTS,
  type SettingRow,
  cregisSettings,
  processorUrls,
  stripeSettings,
} from '@/lib/payment-settings'

export const metadata: Metadata = {
  title: 'Payment settings',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Everything about how money is taken, in one place.
 *
 * The Cregis credentials are editable here; Stripe's are not. That split is deliberate —
 * a Stripe key can move money out of the account, while the Cregis account is deposit-only
 * — and it is explained in src/lib/secure-settings.ts.
 *
 * For everything that stays in the environment, this page tells the operator exactly what
 * is wrong and exactly where to fix it, without becoming somewhere a live key can be read.
 */
export default async function PaymentSettingsPage() {
  const admin = await requireAdmin()

  const stripe = stripeSettings()
  const cregis = await cregisSettings()
  const cregisFormState = await buildCregisFormState()
  const [packages, defaultPkg, cregisReady, recentTests] = await Promise.all([
    sellablePackages(),
    defaultPackage(),
    cregisConfigured(),
    db.checkoutOrder.findMany({
      where: { isTest: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])
  const urls = processorUrls()
  const baseLooksWrong = urls.base !== CANONICAL_BASE_URL
  const stripeReady = stripeConfigured()

  const pricingState: PricingState = {
    // Null while the site is still on the built-in plan: the first save creates the row.
    packageId: isFallbackPackage(defaultPkg) ? null : defaultPkg.id,
    name: defaultPkg.name,
    description: defaultPkg.description,
    priceCents: defaultPkg.priceCents,
    currency: defaultPkg.currency,
    interval: defaultPkg.interval,
    features: defaultPkg.features,
    // A package already selling by card keeps doing so; a brand-new one does if Stripe is
    // configured at all. Nothing here silently turns card sales off.
    sellByCard: isFallbackPackage(defaultPkg) ? stripeReady : defaultPkg.stripePriceId !== null,
    stripeReady,
  }

  const testState: TestState = {
    stripeReady,
    cregisReady,
    adminEmail: admin.email,
    recent: recentTests.map((order) => ({
      id: order.id,
      provider: order.provider,
      amount: order.amount,
      status: order.status,
      when: formatDate(order.createdAt),
    })),
  }

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl px-5 py-12">
        <Link
          href="/admin/payments"
          className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Payments
        </Link>

        <div className="mb-10">
          <span className="eyebrow">Configuration</span>
          <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Payment settings</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
            Stripe takes card subscriptions and renews them automatically. Cregis takes crypto,
            which cannot auto-renew, so those members renew by hand. Both settle to the same
            renewal date, which is the only thing that gates access.
          </p>
        </div>

        {/*
          Price first, and testing second. Those are the two things an operator comes here
          to do; everything below them is credentials and plumbing, which is looked at once
          at setup and then rarely again.
        */}
        <Section title="Price" note="What the site charges. Applies to card and crypto alike.">
          <PricingForm state={pricingState} />

          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            Saving changes the price on the homepage, the join page and both checkouts at once.
            {pricingState.stripeReady && pricingState.sellByCard
              ? ' A matching Stripe price is created for you — Stripe prices cannot be edited, so a new amount is always a new price, and the old one is archived.'
              : ''}{' '}
            Anyone already subscribed keeps the price they signed up at.
          </p>

          {packages.length > 1 && (
            <ul className="mt-5 overflow-hidden rounded-lg border border-line">
              {packages.map((pkg) => (
                <li
                  key={pkg.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-panel px-4 py-3 last:border-b-0"
                >
                  <span className="text-[14px] text-ink">
                    {pkg.name}
                    {pkg.isDefault && <span className="ml-2 text-[12px] text-accent">default</span>}
                  </span>
                  <span className="font-mono text-[13px] text-ink-dim">{priceLine(pkg)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5">
            <ButtonLink href="/admin/payments/packages" variant="ghost" size="sm">
              {packages.length > 1 ? 'Manage all packages' : 'Sell more than one package'}
            </ButtonLink>
          </div>
        </Section>

        <Section
          title="Test a payment"
          note="The only check that proves money actually arrives. Configuration alone cannot."
        >
          <TestPayments state={testState} />
        </Section>

        <Section
          title="Stripe"
          note="Card subscriptions, renewing automatically. Credentials live in Vercel."
          action={{ href: 'https://dashboard.stripe.com/apikeys', label: 'Stripe dashboard' }}
        >
          <SettingTable rows={stripe} />

          <div className="mt-5 rounded-lg border border-line bg-panel px-4 py-1">
            <CopyableUrl label="Webhook endpoint" value={urls.stripeWebhook} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            Register that URL in Stripe → Developers → Webhooks, subscribed to{' '}
            <span className="font-mono text-[12px] text-ink">
              {REQUIRED_STRIPE_EVENTS.join(', ')}
            </span>
            . The signing secret it gives you is{' '}
            <code className="font-mono text-[12px]">STRIPE_WEBHOOK_SECRET</code>. Without it,
            payments succeed and no membership is ever created.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            The Stripe key is not editable from this console: it can move money out of the
            account — charges, refunds, payouts — so it stays in Vercel rather than travelling
            through whichever browser is signed in as an admin. Environment variables are read at
            boot, so a change there needs a redeploy.
          </p>
        </Section>

        <Section
          title="Cregis"
          note="Crypto checkout. Renewed by hand — there is nothing to auto-charge."
        >
          {/*
            Editable, unlike Stripe. The account is deposit-only, so the worst an exposed key
            permits is receiving money — which makes rotating it without a redeploy the
            better trade. Values are encrypted at rest and never sent back to the browser.
          */}
          <CregisForm state={cregisFormState} />

          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            Editable here because this account is deposit-only. Saved values are encrypted, take
            effect immediately with no redeploy, override the matching environment variable, and
            are never displayed again — the fields show where each value came from, not what it
            is.
          </p>

          <h3 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            In effect now
          </h3>
          <SettingTable rows={cregis} />

          <div className="mt-5 rounded-lg border border-line bg-panel px-4 py-1">
            <CopyableUrl label="Callback URL" value={urls.cregisCallback} />
            <CopyableUrl label="Success URL" value={urls.checkoutSuccess} />
            <CopyableUrl label="Cancelled URL" value={urls.checkoutCancelled} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            Cregis calls from a rotating pool of addresses, so no static outbound IP is involved.
            If a checkout ever fails on authorisation while the credentials are unchanged, that is
            the first thing to re-examine.
          </p>
        </Section>

        <Section
          title="Check the configuration"
          note="Read-only. A key can be revoked, a price can be one-off, a webhook can point at an old domain."
        >
          <PaymentChecks />
        </Section>

        {/*
          Last, but not unimportant: every webhook URL above is built from this, so a wrong
          value here makes all of them wrong — the classic cause of "they paid and nothing
          happened". It sits at the bottom because it is set once and never touched again.
        */}
        <Section title="Site address" note="Every URL above is built from this. Set by APP_BASE_URL in Vercel.">
          <div className="rounded-lg border border-line bg-panel px-4 py-3">
            <p className="break-all font-mono text-[13px] text-ink">{urls.base}</p>
            {baseLooksWrong && (
              <p className="mt-2 text-[13px] leading-relaxed text-accent">
                This is not {CANONICAL_BASE_URL}. If this is production, fix APP_BASE_URL before
                anything else — the webhook URLs registered with your processors will not match
                what this deployment actually serves.
              </p>
            )}
          </div>
        </Section>
      </div>
    </ToastProvider>
  )
}

function Section({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[19px] text-ink">{title}</h2>
        {action && (
          <a
            href={action.href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-accent hover:underline"
          >
            {action.label}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      {note && <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-ink-dim">{note}</p>}
      {children}
    </section>
  )
}

function SettingTable({ rows }: { rows: SettingRow[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-3.5 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] text-ink">{row.label}</span>
              <code className="font-mono text-[11px] text-ink-dim">{row.key}</code>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{row.what}</p>
            {row.detail && (
              <p
                className={
                  row.detail.includes('TEST key')
                    ? 'mt-1.5 font-mono text-[12px] text-down'
                    : 'mt-1.5 break-all font-mono text-[12px] text-ink-dim'
                }
              >
                {row.detail}
              </p>
            )}
          </div>

          <StatusBadge status={row.status} />
        </li>
      ))}
    </ul>
  )
}

function StatusBadge({ status }: { status: SettingRow['status'] }) {
  if (status === 'set') return <Badge tone="up">Set</Badge>
  if (status === 'placeholder') return <Badge tone="down">Placeholder</Badge>
  return <Badge tone="down">Missing</Badge>
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">{label}</dt>
      <dd className="mt-1 text-[14px] text-ink">{value}</dd>
    </div>
  )
}

/**
 * What the console may know about each Cregis value.
 *
 * Note what is absent: the values. A saved credential is never sent back to the browser,
 * so there is no screen in this product on which a live key can be read — only its
 * length, its source and when it last changed.
 */
async function buildCregisFormState(): Promise<CregisFormState> {
  const resolved = await resolveCregisSettings()
  const meta = await settingsMetadata(Object.values(CREGIS_SETTING_KEYS))

  const field = (
    key: string,
    entry: { value: string | null; source: 'console' | 'environment' | 'unset' },
    detail: string | null,
  ) => ({
    source: entry.source,
    detail,
    updatedAt: meta[key]?.updatedAt ? formatDate(meta[key]!.updatedAt) : null,
    updatedByEmail: meta[key]?.updatedByEmail ?? null,
  })

  return {
    projectId: field(
      CREGIS_SETTING_KEYS.projectId,
      resolved.projectId,
      resolved.projectId.value ? `${resolved.projectId.value.length} characters` : null,
    ),
    apiKey: field(
      CREGIS_SETTING_KEYS.apiKey,
      resolved.apiKey,
      resolved.apiKey.value ? `${resolved.apiKey.value.length} characters` : null,
    ),
    // Not a credential, so it is shown in full — that is what makes it checkable.
    baseUrl: field(CREGIS_SETTING_KEYS.baseUrl, resolved.baseUrl, resolved.baseUrl.value),
    callbackIps: {
      ...field(
        CREGIS_SETTING_KEYS.callbackIps,
        { value: resolved.callbackIps.value.join('\n') || null, source: resolved.callbackIps.source },
        null,
      ),
      value: resolved.callbackIps.value.join('\n'),
    },
  }
}
