/**
 * Pacing for outbound provider calls.
 *
 * ## Why this exists
 *
 * The delivery loop sends sequentially, which bounds *concurrency* but not *rate* — and a
 * rate limit is what Resend enforces: ten requests per second, account-wide. A sequential
 * loop with a fast provider happily issues dozens of requests a second, and the eleventh
 * comes back `429`.
 *
 * That defect sat latent for as long as `EMAIL_PROVIDER` was `console`, because the
 * console provider returns a result without making a network call. The loop had therefore
 * never once been rate-limited before the day a real provider was switched on.
 *
 * ## Interval pacing, not a sliding window
 *
 * The pacer holds a minimum gap between request *starts*. A window counter would allow a
 * burst of ten and then a stall, which is within the published limit but sits right on it
 * — and the limit is account-wide, so a receipt or a magic link firing from another
 * request at the same moment is enough to tip a burst over. A flat interval leaves that
 * headroom permanently.
 *
 * The cost is honest: at eight a second a hundred-member send takes about twelve seconds
 * of wall clock instead of as fast as the network allows. Publishing already runs in a
 * route that waits for delivery, so that is twelve seconds the admin waits — acceptable
 * next to emails that do not arrive.
 *
 * ## What this cannot do
 *
 * A pacer only governs the calls that go through it, in one process. Nothing here can see
 * a transactional email sent by another serverless invocation, and the limit is shared
 * across the whole account. Pacing makes a breach unlikely; the retry in
 * `notifications/retry.ts` is what makes one survivable. Both are needed, and neither
 * replaces the other.
 */

/** Resend's published limit for the account: ten requests per second. */
export const RESEND_LIMIT_PER_SECOND = 10

/**
 * What we actually send at.
 *
 * Deliberately under the limit. The spare two requests a second are the room for
 * transactional mail — receipts, magic links, renewal reminders — firing from other
 * requests while a send is in progress, none of which this pacer can see.
 */
export const SEND_PER_SECOND = 8

/** The smallest gap between two request starts that keeps to a given rate. */
export function minIntervalMs(perSecond: number): number {
  if (!Number.isFinite(perSecond) || perSecond <= 0) {
    throw new RangeError(`[NordStar] A send rate must be a positive number, got ${perSecond}.`)
  }
  // Rounded up: 1000/3 = 333.33 would drift over the limit across a long run.
  return Math.ceil(1000 / perSecond)
}

/**
 * How long to wait before starting the next request. Pure, so the arithmetic is testable
 * without a clock or a timer.
 */
export function paceDelayMs(args: {
  perSecond: number
  /** When the previous request started, or null if this is the first. */
  lastStartedAt: number | null
  now: number
}): number {
  if (args.lastStartedAt === null) return 0
  const due = args.lastStartedAt + minIntervalMs(args.perSecond)
  return Math.max(0, due - args.now)
}

export type Pacer = {
  /** Resolves when it is this caller's turn to issue a request. */
  wait(): Promise<void>
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A pacer that admits callers one at a time, no faster than `perSecond`.
 *
 * Callers are queued rather than merely delayed. Two callers awaiting at the same instant
 * would otherwise both read the same `lastStartedAt`, compute the same delay, and issue
 * their requests together — which is the breach this is here to prevent. The delivery loop
 * is sequential today, but a pacer that only works for sequential callers is a trap for
 * whoever parallelises it later.
 */
export function createPacer(
  options: {
    perSecond?: number
    now?: () => number
    sleep?: (ms: number) => Promise<void>
  } = {},
): Pacer {
  const perSecond = options.perSecond ?? SEND_PER_SECOND
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? realSleep

  let lastStartedAt: number | null = null
  let queue: Promise<void> = Promise.resolve()

  return {
    wait() {
      const turn = queue.then(async () => {
        const delay = paceDelayMs({ perSecond, lastStartedAt, now: now() })
        if (delay > 0) await sleep(delay)
        // Recorded at the start of the request, not the end: the limit counts requests
        // issued per second, and a slow request has already spent its slot.
        lastStartedAt = now()
      })
      // The queue must keep moving even if one caller's wait rejects.
      queue = turn.catch(() => {})
      return turn
    },
  }
}

/**
 * The pacer every report send shares.
 *
 * Module-level on purpose. The weekly cron publishes each due report in turn, calling
 * delivery once per report with no gap between them — so a per-call pacer would reset
 * between reports and the first send of each one could breach. One pacer per process
 * paces the whole run, which is the unit the account limit is actually measured over.
 */
export const sendPacer: Pacer = createPacer()
