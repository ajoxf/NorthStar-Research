import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { CODE_VALIDITY_DAYS, codeExpiresAt, generateRedemptionCode } from '@/lib/codes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  count: z.number().int().min(1).max(50),
  note: z.string().trim().max(120).optional(),
  /** 100 = free, 0 = full price. Metadata only — see the note below. */
  discountPercent: z.number().int().min(0).max(100).default(100),
})

/**
 * Mint access codes by hand, with no payment behind them.
 *
 * This is the friends-and-family / comp path, and it exists so the operator never has to
 * touch a SQL client. A code created here is identical to one minted by the Cregis
 * callback except that `cregisOrderId` is null — that null is what distinguishes a
 * gifted code from a paid one in the list view and in any later reporting.
 *
 * Redeeming any code grants one billing period from the moment of redemption
 * (`addBillingPeriod`, +1 calendar month), so issuing a code early costs nothing — but
 * the code itself lapses after CODE_VALIDITY_DAYS, so it is not an open-ended liability
 * sitting in an inbox.
 *
 * `discountPercent` is **metadata and nothing else**. Every code unlocks the same
 * membership period however it is labelled, and no checkout amount anywhere is derived
 * from it: a half-price deal is settled however the operator settled it, off-system. It
 * exists so a batch can be read back as a campaign — "the 50% launch offer" — instead of
 * an undifferentiated pile of comps. Do not wire it into pricing without saying so.
 */
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Choose how many codes to create.' },
      { status: 400 },
    )
  }

  const { count, note, discountPercent } = parsed.data
  const created: string[] = []

  // `code` is unique. On the astronomically unlikely collision, retry rather than
  // failing the whole batch in front of a non-technical operator — and if a batch does
  // partially fail, return what was created so those codes are not silently lost.
  for (let i = 0; i < count; i += 1) {
    let minted = false

    for (let attempt = 0; attempt < 5 && !minted; attempt += 1) {
      const code = generateRedemptionCode()
      try {
        await db.redemptionCode.create({
          data: {
            code,
            status: 'unused',
            // The note is a note. It used to be written into `email`, which meant a
            // gifted code carried an operator's scribble where an address belonged.
            note: note || null,
            discountPercent,
            expiresAt: codeExpiresAt(),
          },
        })
        created.push(code)
        minted = true
      } catch {
        if (attempt === 4) {
          return NextResponse.json(
            {
              error: `Created ${created.length} of ${count}. Try again for the rest.`,
              codes: created,
            },
            { status: 500 },
          )
        }
      }
    }
  }

  return NextResponse.json({ codes: created, validForDays: CODE_VALIDITY_DAYS })
}
