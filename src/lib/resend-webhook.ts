import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verifying and interpreting Resend's delivery webhooks.
 *
 * Kept apart from the route so the signature check can be tested directly. It is worth
 * testing: this is the only thing standing between "engagement data" and "anything anyone
 * chose to POST at us", and an engagement dashboard built on forged events is worse than
 * no dashboard, because it looks authoritative.
 *
 * Resend signs with Svix. The scheme is an HMAC-SHA256 over `id.timestamp.body`, keyed on
 * the base64 body of a `whsec_`-prefixed secret, and the header may carry several
 * space-separated signatures during a secret rotation — so any one matching is a pass.
 */

const SIGNATURE_VERSION = 'v1'

/** Older than this and a replayed capture is refused, even with a valid signature. */
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

export type SvixHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export function readSvixHeaders(headers: Headers): SvixHeaders {
  return {
    id: headers.get('svix-id'),
    timestamp: headers.get('svix-timestamp'),
    signature: headers.get('svix-signature'),
  }
}

/**
 * Is this really from Resend, and recent?
 *
 * `nowSeconds` is injected rather than read from the clock so the tolerance window is
 * testable without waiting five minutes.
 */
export function verifyResendSignature(
  payload: string,
  headers: SvixHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false

  const sentAt = Number(headers.timestamp)
  if (!Number.isFinite(sentAt)) return false
  if (Math.abs(nowSeconds - sentAt) > TIMESTAMP_TOLERANCE_SECONDS) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  if (key.length === 0) return false

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest('base64')

  // The header carries "v1,<sig>" entries, space separated. During a rotation there are
  // two, signed with the old and new secrets, and either may be the valid one.
  return headers.signature
    .split(' ')
    .map((entry) => entry.split(','))
    .filter(([version]) => version === SIGNATURE_VERSION)
    .some(([, candidate]) => safeEqual(candidate ?? '', expected))
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** What a Resend event means for a DeliveryLog row. */
export type DeliveryOutcome = {
  status: 'delivered' | 'opened' | 'clicked' | 'failed'
  /** Which timestamp column the event fills in, if any. */
  stamp: 'deliveredAt' | 'openedAt' | null
  /** Higher wins. Prevents a late `delivered` from undoing a recorded `opened`. */
  rank: number
}

/**
 * Events are not guaranteed in order.
 *
 * A `delivered` webhook can arrive after an `opened` one — retries, queueing, a slow
 * hop — and applying it blindly would walk the row backwards and quietly under-report
 * engagement. The rank is what makes the update monotonic.
 */
export function outcomeForEvent(type: string): DeliveryOutcome | null {
  switch (type) {
    case 'email.delivered':
      return { status: 'delivered', stamp: 'deliveredAt', rank: 1 }
    case 'email.opened':
      return { status: 'opened', stamp: 'openedAt', rank: 2 }
    case 'email.clicked':
      return { status: 'clicked', stamp: 'openedAt', rank: 3 }
    case 'email.bounced':
    case 'email.complained':
      // A bounce outranks everything: the member did not get it, and that must not be
      // overwritten by a stale success event arriving afterwards.
      return { status: 'failed', stamp: null, rank: 4 }
    default:
      // delivery_delayed, sent, and anything Resend adds later. Nothing to record.
      return null
  }
}

export const OUTCOME_RANK: Record<string, number> = {
  sent: 0,
  queued: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  failed: 4,
}
