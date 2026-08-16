import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { CopyableUrl, PaymentChecks } from '@/app/admin/payments/settings/payment-checks'
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
 * What this page does *not* do is hold the credentials. They are entered in Vercel and
 * read from the environment — see the note in src/lib/payment-settings.ts for why a form
 * that writes a live API key into Postgres would be a worse arrangement, not a more
 * convenient one. This page tells the operator exactly what is wrong and exactly where to
 * fix it, which is the useful half, without becoming somewhere a live key can leak from.
 */
export default async function PaymentSettingsPage() {
  await requireAdmin()

  const stripe = stripeSettings()
  const cregis = cregisSettings()
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
          Keys are read from the environment and are deliberately not editable here. Putting a
          live payment credential behind a web form would copy it into the database in plain
          text and send it through whichever browser happens to be signed in as an admin — and
          it would give the deployment two sources of truth for which account gets charged.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
          Environment variables are only read at boot, so a change does not take effect until
          you redeploy.
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
