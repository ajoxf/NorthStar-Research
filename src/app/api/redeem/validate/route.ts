import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { isCodeExpired, normaliseCode } from '@/lib/codes'

export const runtime = 'nodejs'

const schema = z.object({ code: z.string().min(4) })

/**
 * Step 1 of the redemption wizard: is this code real and unused?
 *
 * Returns only whether the code is valid and (if the checkout captured one) the email
 * to prefill — never any other member's data.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the access code from your email.' }, { status: 400 })
  }

  const code = normaliseCode(parsed.data.code)
  const record = await db.redemptionCode.findUnique({ where: { code } })

  if (!record) {
    return NextResponse.json(
      { error: 'We do not recognise that code. Check it and try again.' },
      { status: 404 },
    )
  }

  if (record.status === 'redeemed') {
    return NextResponse.json(
      { error: 'This code has already been used. If that was not you, contact support.' },
      { status: 409 },
    )
  }

  // Says plainly that it expired rather than that it is invalid: someone holding a real
  // code that ran out needs to know to ask for a new one, not to re-type this one.
  if (isCodeExpired(record)) {
    return NextResponse.json(
      { error: 'This code has expired. Contact support and we will issue you a new one.' },
      { status: 410 },
    )
  }

  return NextResponse.json({ ok: true, code, email: record.email ?? null })
}
