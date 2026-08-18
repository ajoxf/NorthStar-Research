import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { emailSchema } from '@/lib/validation'
import { appBaseUrl, optionalEnv } from '@/lib/env'
import { DEFAULT_EMAIL_FROM } from '@/lib/notifications/from'
import { emailProviderForTesting, providerNames } from '@/lib/notifications'
import { recordEmail } from '@/lib/notifications/record'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Send one real welcome email, and report exactly what the provider said.
 *
 * The welcome template specifically, because that is the message a new member is
 * supposed to receive and therefore the one worth proving. A generic "test" body would
 * exercise a slightly different path and prove slightly less.
 *
 * The point of this endpoint is the error string. Every likely cause of "the client
 * never got their email" is invisible from the outside and identical from the inside:
 *
 * - the console provider is active, so nothing was ever sent;
 * - the From domain is not verified with the provider, so it was rejected;
 * - the API key is a test-mode key, which can only deliver to the account owner;
 * - a plan limit was reached.
 *
 * Each of those produces a different, specific sentence from Resend, and this hands that
 * sentence back verbatim rather than replacing it with "sending failed".
 */
const schema = z.object({ to: emailSchema })

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the address to send the test to.' }, { status: 400 })
  }

  const to = parsed.data.to.trim().toLowerCase()
  const provider = providerNames().email
  const from = optionalEnv('EMAIL_FROM', DEFAULT_EMAIL_FROM)

  // Answered before spending a round trip, because it is the most likely cause and the
  // one the provider itself can never report — nothing is sent, so nothing can fail.
  if (provider === 'console') {
    await recordEmail('test', to, {
      status: 'failed',
      provider: 'console',
      error: 'EMAIL_PROVIDER is unset or set to console, so no mail is sent at all.',
    })

    return NextResponse.json({
      ok: false,
      provider,
      from,
      error:
        'Nothing was sent. This deployment is on the console provider, which logs each message ' +
        'and reports it as sent without contacting anyone. Set EMAIL_PROVIDER=resend and ' +
        'RESEND_API_KEY in Vercel, then redeploy — environment variables are only read at boot.',
    })
  }

  try {
    // The provider directly, so this is filed as a probe rather than as somebody's
    // welcome. Same vendor code path either way — only the label differs.
    const result = await emailProviderForTesting().sendWelcomeEmail(
      { email: to, firstName: 'there' },
      `${appBaseUrl()}/dashboard`,
      null,
    )
    await recordEmail('test', to, result)

    if (result.status === 'failed') {
      return NextResponse.json({ ok: false, provider, from, error: result.error ?? 'The provider refused the message without giving a reason.' })
    }

    return NextResponse.json({
      ok: true,
      provider,
      from,
      messageId: result.providerMessageId ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordEmail('test', to, { status: 'failed', provider, error: message })
    return NextResponse.json({ ok: false, provider, from, error: message })
  }
}
