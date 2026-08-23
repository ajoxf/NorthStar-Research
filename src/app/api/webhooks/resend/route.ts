import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { isPlaceholder } from '@/lib/env'
import { recordWebhook } from '@/lib/webhook-log'
import {
  OUTCOME_RANK,
  outcomeForEvent,
  readSvixHeaders,
  verifyResendSignature,
} from '@/lib/resend-webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Resend delivery events: delivered, opened, clicked, bounced, complained.
 *
 * This is what turns the delivery log from "we handed it to a provider" into "it arrived,
 * and somebody read it". Without it every row sits at `sent` forever, which is exactly as
 * uninformative as it sounds.
 *
 * **Unverified events are refused, not recorded.** The endpoint is public by necessity,
 * so anyone can POST to it; engagement figures built from forged events would be worse
 * than none, because a dashboard is believed.
 *
 * If `RESEND_WEBHOOK_SECRET` is unset the endpoint returns 503 rather than accepting
 * everything. A missing secret is a configuration mistake, and the failure mode of
 * guessing otherwise is silent data poisoning.
 */
export async function POST(request: Request) {
  /*
   * Every exit below is recorded, not only the failures.
   *
   * The state that needs distinguishing is not "did it work" but "which of three
   * indistinguishable things is happening": nothing arriving, arriving and being
   * refused, or arriving and applied. Recording only errors would leave the first two
   * looking the same — an empty log either way.
   */
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret || isPlaceholder(secret)) {
    console.error('[resend:webhook] rejected — RESEND_WEBHOOK_SECRET is not configured')
    await recordWebhook({
      provider: 'resend',
      outcome: 'not_configured',
      detail: 'RESEND_WEBHOOK_SECRET is unset or still a placeholder.',
    })
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  // Read the raw body: the signature covers the exact bytes, so parsing first and
  // re-serialising would change them and fail every check.
  const payload = await request.text()

  if (!verifyResendSignature(payload, readSvixHeaders(request.headers), secret)) {
    console.error('[resend:webhook] rejected — signature verification failed')
    await recordWebhook({
      provider: 'resend',
      outcome: 'rejected_signature',
      detail:
        'The signature did not match. Usually RESEND_WEBHOOK_SECRET differs from the ' +
        'signing secret shown on the endpoint in Resend.',
    })
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { email_id?: string } }
  try {
    event = JSON.parse(payload)
  } catch {
    await recordWebhook({ provider: 'resend', outcome: 'invalid_payload' })
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const outcome = outcomeForEvent(String(event.type ?? ''))
  const messageId = event.data?.email_id

  // Acknowledged rather than errored: an event we do not track is not a failure, and a
  // non-2xx would make Resend retry it forever.
  if (!outcome || !messageId) {
    await recordWebhook({
      provider: 'resend',
      outcome: 'ignored',
      eventType: event.type,
      messageId,
      detail: outcome ? 'The event carried no message id.' : 'Not an event this app tracks.',
    })
    return NextResponse.json({ ok: true, ignored: true })
  }

  const log = await db.deliveryLog.findFirst({ where: { providerMessageId: messageId } })
  if (!log) {
    // Normal for anything not sent through the report pipeline — a welcome or a receipt
    // has no DeliveryLog row. Not an error.
    await recordWebhook({
      provider: 'resend',
      outcome: 'unmatched',
      eventType: event.type,
      messageId,
      detail: 'No delivery log for that message — normal for a welcome, receipt or sign-in link.',
    })
    return NextResponse.json({ ok: true, unmatched: true })
  }

  // Monotonic: events arrive out of order, and a late `delivered` must not undo a
  // recorded `opened`. See the note on rank in resend-webhook.ts.
  if ((OUTCOME_RANK[log.status] ?? 0) > outcome.rank) {
    await recordWebhook({
      provider: 'resend',
      outcome: 'stale',
      eventType: event.type,
      messageId,
      detail: `Already at ${log.status}; this event is older.`,
    })
    return NextResponse.json({ ok: true, stale: true })
  }

  await db.deliveryLog.update({
    where: { id: log.id },
    data: {
      status: outcome.status,
      ...(outcome.stamp === 'deliveredAt' && !log.deliveredAt ? { deliveredAt: new Date() } : {}),
      // First open only. Overwriting it on every re-open would turn "when they read it"
      // into "when they last glanced at it", and the first is the useful one.
      ...(outcome.stamp === 'openedAt' && !log.openedAt ? { openedAt: new Date() } : {}),
    },
  })

  await recordWebhook({
    provider: 'resend',
    outcome: 'applied',
    eventType: event.type,
    messageId,
    detail: `Delivery marked ${outcome.status}.`,
  })

  return NextResponse.json({ ok: true })
}
