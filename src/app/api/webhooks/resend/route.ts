import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { isPlaceholder } from '@/lib/env'
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
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret || isPlaceholder(secret)) {
    console.error('[resend:webhook] rejected — RESEND_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  // Read the raw body: the signature covers the exact bytes, so parsing first and
  // re-serialising would change them and fail every check.
  const payload = await request.text()

  if (!verifyResendSignature(payload, readSvixHeaders(request.headers), secret)) {
    console.error('[resend:webhook] rejected — signature verification failed')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { email_id?: string } }
  try {
    event = JSON.parse(payload)
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const outcome = outcomeForEvent(String(event.type ?? ''))
  const messageId = event.data?.email_id

  // Acknowledged rather than errored: an event we do not track is not a failure, and a
  // non-2xx would make Resend retry it forever.
  if (!outcome || !messageId) return NextResponse.json({ ok: true, ignored: true })

  const log = await db.deliveryLog.findFirst({ where: { providerMessageId: messageId } })
  if (!log) {
    // Normal for anything not sent through the report pipeline — a welcome or a receipt
    // has no DeliveryLog row. Not an error.
    return NextResponse.json({ ok: true, unmatched: true })
  }

  // Monotonic: events arrive out of order, and a late `delivered` must not undo a
  // recorded `opened`. See the note on rank in resend-webhook.ts.
  if ((OUTCOME_RANK[log.status] ?? 0) > outcome.rank) {
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

  return NextResponse.json({ ok: true })
}
