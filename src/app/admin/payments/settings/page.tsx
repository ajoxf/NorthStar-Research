import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { CopyableUrl, PaymentChecks } from '@/app/admin/payments/settings/payment-checks'
import { CregisForm, type CregisFormState } from '@/app/admin/payments/settings/cregis-form'
import { CREGIS_SETTING_KEYS, resolveCregisSettings } from '@/lib/cregis-settings'
import { settingsMetadata } from '@/lib/secure-settings'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { CANONICAL_BASE_URL, PLAN } from '@/lib/env'
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
  await requireAdmin()

  const stripe = stripeSettings()
  const cregis = await cregisSettings()
  const cregisFormState = await buildCregisFormState()
  const urls = processorUrls()
  const baseLooksWrong = urls.base !== CANONICAL_BASE_URL

  return (
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
          which cannot auto-renew — a crypto payment is a push with no stored mandate, so those
          members renew by hand. Both settle to the same renewal date, which is the only thing
          that gates access.
        </p>
      </div>

      {/*
        The base URL comes first because every webhook below is derived from it. If it is
        wrong, every URL on this page is wrong with it — and a webhook pointing at a
        previous domain is the classic cause of "they paid and nothing happened".
      */}
      <Section
        title="Site address"
        note="Every URL below is built from this. Set by APP_BASE_URL in Vercel."
      >
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

      <Section
        title="Stripe"
        note={`Card subscriptions at $${PLAN.priceUsd} per month, renewing automatically.`}
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
          . The signing secret it gives you is <code className="font-mono text-[12px]">STRIPE_WEBHOOK_SECRET</code>.
          Without it, payments succeed and no membership is ever created.
        </p>
      </Section>

      <Section
        title="Cregis"
        note="Crypto checkout. Paid per period by hand — there is nothing to auto-charge."
      >
        {/*
          Editable, unlike Stripe. The account is deposit-only, so the worst an exposed key
          permits is receiving money — which makes rotating it without a redeploy the
          better trade. Values are encrypted at rest and never sent back to the browser.
        */}
        <CregisForm state={cregisFormState} />

        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          Saved values are encrypted with a key derived from{' '}
          <code className="font-mono text-[12px]">AUTH_SECRET</code> and are never displayed
          again — the fields above show where each value comes from, not what it is. Changing{' '}
          <code className="font-mono text-[12px]">AUTH_SECRET</code> makes them unreadable, and
          they would need re-entering.
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
          The callback must acknowledge with the literal word{' '}
          <code className="font-mono text-[12px]">success</code>, which this app already does.
          Cregis calls from a rotating pool of addresses, so no static outbound IP is involved —
          if a checkout ever fails on authorisation while the credentials are unchanged, that is
          the first thing to re-examine.
        </p>
      </Section>

      <Section
        title="Verify it works"
        note="Presence is not proof. A key can be revoked, a price can be one-off, a webhook can point at an old domain."
      >
        <PaymentChecks />
      </Section>

      <Section
        title="Where the credentials live"
        note="Vercel → Settings → Environment Variables, then redeploy."
        action={{
          href: 'https://vercel.com/ajoxfs-projects/north-star-research/settings/environment-variables',
          label: 'Open in Vercel',
        }}
      >
        <p className="text-[14px] leading-relaxed text-ink-dim">
          <strong className="font-medium text-ink">Stripe stays here, in Vercel.</strong> That key
          can move money out of the account — charges, refunds, payouts — so it is deliberately
          not editable from a web form, where it would travel through whichever browser happens
          to be signed in as an admin.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
          <strong className="font-medium text-ink">Cregis can be edited above</strong>, because
          that account is deposit-only: the worst an exposed key permits is receiving money.
          Anything saved there overrides the matching variable below and takes effect
          immediately, with no redeploy.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
          Environment variables are only read at boot, so a change made in Vercel does not take
          effect until you redeploy.
        </p>
      </Section>

      <Section title="The plan" note="One price, no tiers.">
        <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          <Fact label="Price" value={`$${PLAN.priceUsd} / ${PLAN.interval}`} />
          <Fact label="Currency" value={PLAN.currency} />
          <Fact label="Includes" value={PLAN.description} />
        </dl>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          The price is fixed in code and in your Stripe price object, and is not editable from
          this console — changing it in one place only would mean the site advertises one figure
          while buyers are charged another.
        </p>
      </Section>
    </div>
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
