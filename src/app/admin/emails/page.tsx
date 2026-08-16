import type { Metadata } from 'next'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { EmailPreviewList } from '@/app/admin/emails/email-preview-list'
import { requireAdmin } from '@/lib/auth'
import { optionalEnv } from '@/lib/env'
import { DEFAULT_EMAIL_FROM } from '@/lib/notifications/from'
import { providerNames } from '@/lib/notifications'
import { emailPreviews } from '@/lib/notifications/previews'

export const metadata: Metadata = { title: 'Emails', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Every email the product sends, as the member will see it.
 *
 * Read-only by design — there is no send button and no recipient field anywhere on this
 * page. Proofreading copy and mailing the membership are different activities and should
 * not share a screen.
 *
 * The status panel above the previews reports what is *actually* configured, because the
 * failure this page exists to catch is not a typo in the copy — it is a deployment that
 * is silently on the console provider and delivering nothing at all, which no amount of
 * reading the templates would reveal.
 */
export default async function AdminEmailsPage() {
  await requireAdmin()

  const previews = emailPreviews()
  const provider = providerNames().email
  const from = optionalEnv('EMAIL_FROM', DEFAULT_EMAIL_FROM)
  const deskAddress = optionalEnv('SAMPLE_REPORT_REQUEST_TO', from)
  const live = provider !== 'console'

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="mb-8">
        <span className="eyebrow">Transactional mail</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Emails</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
          Every message the product sends, rendered with sample data. Nothing on this page
          sends anything.
        </p>
      </div>

      <dl className="mb-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Fact label="Provider" value={provider} />
        <Fact label="From" value={from} />
        <Fact label="Enquiries to" value={deskAddress} />
      </dl>

      {live ? (
        <p className="mb-10 flex items-start gap-2 text-[13px] leading-relaxed text-ink-dim">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
          <span>
            Mail is being delivered through {provider}. The From address must belong to a
            domain verified with that provider, or sends will be rejected.
          </span>
        </p>
      ) : (
        <p className="mb-10 flex items-start gap-2 rounded-lg border border-down/35 bg-down/10 p-4 text-[13px] leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-down" aria-hidden />
          <span>
            <strong className="font-medium">No mail is being delivered.</strong> The console
            provider is active, which logs each message to the server output and reports it as
            sent — so the delivery log will look healthy while members receive nothing. Set{' '}
            <code className="font-mono text-[12px] text-accent">EMAIL_PROVIDER=resend</code> and{' '}
            <code className="font-mono text-[12px] text-accent">RESEND_API_KEY</code> to send for
            real.
          </span>
        </p>
      )}

      <EmailPreviewList previews={previews} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">{label}</dt>
      <dd className="mt-1 break-words text-[14px] text-ink">{value}</dd>
    </div>
  )
}
