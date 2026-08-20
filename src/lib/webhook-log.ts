import 'server-only'

import type { WebhookOutcome } from '@prisma/client'

import { db } from '@/lib/db'

/**
 * Write down that a provider called, and what became of it.
 *
 * Never throws. Recording an event must not be able to fail the handling of it — and in
 * particular must not turn a successfully applied event into a 500, which would make the
 * provider retry something that already worked.
 */
export async function recordWebhook(input: {
  provider: string
  outcome: WebhookOutcome
  eventType?: string | null
  messageId?: string | null
  detail?: string | null
}): Promise<void> {
  try {
    await db.webhookLog.create({
      data: {
        provider: input.provider,
        outcome: input.outcome,
        eventType: input.eventType || null,
        messageId: input.messageId || null,
        detail: input.detail ? input.detail.slice(0, 300) : null,
      },
    })
  } catch (error) {
    console.error('[webhooks] could not record inbound event', error)
  }
}

export type WebhookHealth = {
  /** Has any event, of any outcome, ever arrived? */
  everCalled: boolean
  /** Have any been applied — the only outcome that actually moves the numbers? */
  everApplied: boolean
  /** Rejections in the last day. Non-zero means the secret is probably wrong. */
  recentRejections: number
  recent: {
    id: string
    provider: string
    eventType: string | null
    outcome: WebhookOutcome
    detail: string | null
    createdAt: Date
  }[]
}

/**
 * Enough to tell the three states apart at a glance.
 *
 *   nothing ever arrived   → the endpoint is not registered, or points elsewhere
 *   arriving, all rejected → the signing secret does not match
 *   arriving and applied   → working
 *
 * Those are indistinguishable without this, which is the entire reason it exists.
 */
export async function webhookHealth(provider = 'resend'): Promise<WebhookHealth> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [total, applied, recentRejections, recent] = await Promise.all([
    db.webhookLog.count({ where: { provider } }),
    db.webhookLog.count({ where: { provider, outcome: 'applied' } }),
    db.webhookLog.count({
      where: {
        provider,
        outcome: { in: ['rejected_signature', 'not_configured'] },
        createdAt: { gte: dayAgo },
      },
    }),
    db.webhookLog.findMany({
      where: { provider },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        provider: true,
        eventType: true,
        outcome: true,
        detail: true,
        createdAt: true,
      },
    }),
  ])

  return {
    everCalled: total > 0,
    everApplied: applied > 0,
    recentRejections,
    recent,
  }
}
