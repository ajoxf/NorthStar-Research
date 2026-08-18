import type { Metadata } from 'next'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { EmailPreviewList } from '@/app/admin/emails/email-preview-list'
import { EmailTest } from '@/app/admin/emails/email-test'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { optionalEnv } from '@/lib/env'
import { DEFAULT_EMAIL_FROM } from '@/lib/notifications/from'
import { providerNames } from '@/lib/notifications'
import { emailPreviews } from '@/lib/notifications/previews'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Emails', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Every email the product sends, as the member will see it — plus whether they are
 * actually arriving.
 *
 * There is still no way to mail the membership from here; proofreading copy and running a
 * campaign are different activities and should not share a screen. What this page does
 * now have is a single-recipient diagnostic, which is a different thing again: it proves
 * the pipe works, to one address the operator names.
 *
 * That was added because reading templates could never answer the question people
 * actually arrive at this page with. The status panel catches a deployment silently on
 * the console provider; the send log below catches everything after that — an unverified
 * From domain, a test-mode key that only delivers to the account owner, a plan limit —
 * each of which produces a specific sentence from the provider that used to go to
 * `console.error` and nowhere a human would look.
 */
export default async function AdminEmailsPage() {
  const admin = await requireAdmin()

  const previews = emailPreviews()
  const provider = providerNames().email
  const from = optionalEnv('EMAIL_FROM', DEFAULT_EMAIL_FROM)
  const deskAddress = optionalEnv('SAMPLE_REPORT_REQUEST_TO', from)
  const live = provider !== 'console'

  const recent = await db.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: 25 })
  const failures = recent.filter((entry) => entry.status === 'failed').length

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

      <section className="mb-12">
        <h2 className="mb-1 text-[19px] text-ink">Is it actually sending?</h2>
        <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
          Send yourself the real welcome email. Whatever the provider answers is shown
          unedited — that sentence is usually the whole diagnosis.
        </p>
        <EmailTest defaultTo={admin.email} />
      </section>

      <section className="mb-12">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[19px] text-ink">Recent sends</h2>
          {failures > 0 && (
            <span className="font-mono text-[12px] text-down">
              {failures} of the last {recent.length} failed
            </span>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="rounded-lg border border-line bg-panel px-4 py-3.5 text-[14px] leading-relaxed text-ink-dim">
            Nothing recorded yet. Every welcome, access code, receipt, sign-in link and renewal
            reminder will appear here from now on, with whatever the provider said about it.
            Report sends are not listed — those are in each report&rsquo;s own delivery log.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="border-b border-line bg-panel px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 break-all text-[14px] text-ink">{entry.toEmail}</span>
                  <Badge tone={entry.status === 'sent' ? 'up' : 'down'}>{entry.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-ink-dim">
                  {entry.kind.replace(/_/g, ' ')} · {entry.provider ?? 'unknown'} ·{' '}
                  {formatDate(entry.createdAt)}
                </p>
                {entry.error && (
                  // Verbatim, and never truncated in the UI: the tail of a provider error
                  // is often the part that names the actual cause.
                  <p className="mt-1.5 break-words text-[13px] leading-relaxed text-down">
                    {entry.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
