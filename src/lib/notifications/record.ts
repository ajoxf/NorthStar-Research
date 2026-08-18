import 'server-only'

import type { EmailKind } from '@prisma/client'

import { db } from '@/lib/db'
import type { DeliveryResult } from '@/lib/notifications/types'

/**
 * Write down what the provider said, whatever it said.
 *
 * Wrapped in its own try/catch and never rethrown. Recording an outcome must not be able
 * to fail the thing it is recording: a member whose welcome email was sent successfully
 * should not see their registration break because the log write did. The same reasoning
 * that makes the send itself fire-and-forget applies one level down.
 *
 * The error text is stored exactly as the provider gave it. It is the whole diagnostic
 * value of this table — "The domain is not verified" and "You can only send testing
 * emails to your own email address" are different problems with different fixes, and
 * both otherwise present identically as "the client got no email".
 */
export async function recordEmail(
  kind: EmailKind,
  toEmail: string,
  result: DeliveryResult,
): Promise<void> {
  try {
    await db.emailLog.create({
      data: {
        kind,
        toEmail,
        status: result.status === 'sent' ? 'sent' : 'failed',
        provider: result.provider ?? null,
        providerMessageId: result.providerMessageId ?? null,
        // Truncated rather than dropped: a provider that returns a stack trace should not
        // be able to bloat a row, but the first 500 characters always carry the reason.
        error: result.error ? result.error.slice(0, 500) : null,
      },
    })
  } catch (error) {
    console.error('[notifications] could not record email outcome', error)
  }
}

/**
 * Run a send and record it.
 *
 * A thrown provider is recorded too, then rethrown to the caller — every call site
 * already handles that case, and swallowing it here would change behaviour rather than
 * just observing it.
 */
export async function sendAndRecord(
  kind: EmailKind,
  toEmail: string,
  send: () => Promise<DeliveryResult>,
): Promise<DeliveryResult> {
  try {
    const result = await send()
    await recordEmail(kind, toEmail, result)
    return result
  } catch (error) {
    await recordEmail(kind, toEmail, {
      status: 'failed',
      // A provider that threw never told us its name; "threw" is the honest label, and
      // distinguishes this from a provider that answered with a refusal.
      provider: 'threw',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
