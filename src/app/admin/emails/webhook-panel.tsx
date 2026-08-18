import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { CopyableUrl } from '@/app/admin/payments/settings/payment-checks'
import { formatDate } from '@/lib/utils'
import { type WebhookHealth } from '@/lib/webhook-log'

/**
 * Whether the provider is actually calling us, and what happens when it does.
 *
 * Three states that are indistinguishable without a record, and have completely
 * different fixes:
 *
 *   nothing arriving      → the endpoint is not registered, or points at another domain
 *   arriving, all refused → the signing secret does not match
 *   arriving and applied  → working
 *
 * Before this, all three showed the same thing: an Opened column reading zero.
 */
export function WebhookPanel({
  health,
  endpoint,
  secretSet,
}: {
  health: WebhookHealth
  endpoint: string
  secretSet: boolean
}) {
  const state = !health.everCalled
    ? 'silent'
    : health.recentRejections > 0 && !health.everApplied
      ? 'refused'
      : 'working'

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      {state === 'working' && (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-dim">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
          <span>
            <strong className="font-medium text-ink">Events are arriving and being applied.</strong>{' '}
            Opens and clicks on report emails are being recorded.
            {health.recentRejections > 0 &&
              ` ${health.recentRejections} ${health.recentRejections === 1 ? 'was' : 'were'} refused in the last day, though — if you have more than one endpoint registered, one of them has the wrong secret.`}
          </span>
        </p>
      )}

      {state === 'refused' && (
        <p className="flex items-start gap-2 rounded-lg border border-down/35 bg-down/10 p-3.5 text-[13px] leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-down" aria-hidden />
          <span>
            <strong className="font-medium">Resend is calling, and we are turning it away.</strong>{' '}
            {health.recentRejections} event{health.recentRejections === 1 ? '' : 's'} refused in the
            last day. {secretSet
              ? 'The signature did not match, which means RESEND_WEBHOOK_SECRET is not the signing secret shown on this endpoint in Resend. Copy it again — it is per-endpoint, so adding a second endpoint gives you a different one.'
              : 'RESEND_WEBHOOK_SECRET is not set on this deployment. Set it in Vercel and redeploy — environment variables are only read at boot.'}
          </span>
        </p>
      )}

      {state === 'silent' && (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-dim">
          <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden />
          <span>
            <strong className="font-medium text-ink">Nothing has ever arrived.</strong> Resend is not
            calling this deployment — the endpoint is either not registered, or registered against a
            different domain. Nothing is being refused, so the signing secret is not the problem yet.
          </span>
        </p>
      )}

      <div className="mt-4 rounded-lg border border-line bg-panel-2 px-4 py-1">
        <CopyableUrl label="Webhook endpoint" value={endpoint} />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
        Register that in Resend → Webhooks, subscribed to{' '}
        <span className="font-mono text-[12px] text-ink">
          email.delivered, email.opened, email.clicked, email.bounced, email.complained
        </span>
        . Open tracking also has to be switched on for the domain itself — it is off by default, and
        with it off no open event is ever generated however well this is configured.
      </p>

      {health.recent.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            Last {health.recent.length}
          </h3>
          <ul className="overflow-hidden rounded-lg border border-line">
            {health.recent.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-line bg-panel-2 px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[12px] text-ink">
                    {event.eventType ?? 'unparsed'}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-ink-dim">
                    {formatDate(event.createdAt)}
                  </span>
                  {event.detail && (
                    <p className="mt-0.5 break-words text-[12px] leading-relaxed text-ink-dim">
                      {event.detail}
                    </p>
                  )}
                </div>
                <Badge tone={toneFor(event.outcome)}>{event.outcome.replace(/_/g, ' ')}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/*
 * `unmatched`, `stale` and `ignored` are neutral, not warnings. Each is the system
 * working correctly — a receipt has no delivery row, a late event lost to a newer one,
 * an event type we do not track — and colouring them as problems would send an operator
 * hunting for a fault that is not there.
 */
function toneFor(outcome: WebhookHealth['recent'][number]['outcome']): 'up' | 'down' | 'neutral' {
  if (outcome === 'applied') return 'up'
  if (outcome === 'rejected_signature' || outcome === 'not_configured' || outcome === 'invalid_payload') {
    return 'down'
  }
  return 'neutral'
}
