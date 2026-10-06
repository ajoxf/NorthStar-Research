/**
 * Retrying a send that was refused rather than rejected.
 *
 * Separate from the provider, and generic over "the thing that attempts one send", so the
 * retry rules can be tested with a counter and a fake clock instead of a vendor account.
 * The provider keeps one job — turn a message into an API call — and this keeps the other.
 */

import { backoffMs, isRateLimit } from '@/lib/notifications/rate-limit'
import type { DeliveryResult } from '@/lib/notifications/types'

/**
 * Four attempts: the first plus three retries, spanning 500ms + 1s + 2s = 3.5s of waiting.
 *
 * Bounded by what a serverless request can afford, not by what would eventually succeed.
 * Publishing waits for delivery, and a per-member retry budget multiplies across the whole
 * member list; a generous budget here is how a send ends up killed by a function timeout
 * halfway down the list, which loses more mail than it saves.
 */
export const MAX_SEND_ATTEMPTS = 4

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Attempt a send, retrying only while the provider says it is being asked too fast.
 *
 * Anything else returns immediately. A bad address, an unverified sender, a malformed
 * payload: retrying those is three more identical refusals and three more waits, and it
 * delays every member still queued behind this one.
 *
 * When the budget runs out the last failure is returned with the attempt count written
 * into the message. That is what the delivery log records, so "we were throttled and gave
 * up" no longer reads like "that address is wrong" — without a schema change on a database
 * that takes `prisma db push` on every build.
 */
export async function withRateLimitRetry(
  attempt: () => Promise<DeliveryResult>,
  options: {
    sleep?: (ms: number) => Promise<void>
    maxAttempts?: number
    delayFor?: (attempt: number) => number
  } = {},
): Promise<DeliveryResult> {
  const sleep = options.sleep ?? realSleep
  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_SEND_ATTEMPTS)
  const delayFor = options.delayFor ?? backoffMs

  let result = await attempt()
  let attemptsMade = 1

  while (
    result.status === 'failed' &&
    isRateLimit(result.error) &&
    attemptsMade < maxAttempts
  ) {
    await sleep(delayFor(attemptsMade))
    result = await attempt()
    attemptsMade += 1
  }

  if (result.status === 'failed' && isRateLimit(result.error) && attemptsMade > 1) {
    return {
      ...result,
      error: `${result.error} (rate limited; gave up after ${attemptsMade} attempts)`,
    }
  }

  return result
}
