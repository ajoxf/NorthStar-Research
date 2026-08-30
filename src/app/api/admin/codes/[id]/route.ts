import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { MAX_CODE_VALIDITY_DAYS, extendedExpiry } from '@/lib/codes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.union([
  z.object({
    extendDays: z.number().int().min(1).max(MAX_CODE_VALIDITY_DAYS),
  }),
  z.object({
    /** Clear the expiry outright. Named, not reachable by typing a very large number. */
    neverExpires: z.literal(true),
  }),
])

/**
 * Give one code more time.
 *
 * This exists for the ordinary case that codes with a validity window create: somebody
 * emails to say the code they were sent has stopped working. Before this the only answers
 * were a SQL client or minting a second code — and a second code leaves the first one
 * lying in their inbox, still dead, still confusing.
 *
 * Only the expiry moves. Nothing else about the code is editable here: not its discount
 * label, not its note, not its status. An extend action that could quietly turn a redeemed
 * code back into an unused one would be a way to hand out a second membership for free.
 *
 * Redeemed codes are refused for the same reason. Once a code has been used it is a
 * historical record of how somebody got their membership, and its expiry no longer governs
 * anything — extending it would only make the record wrong.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
      { error: 'Say how many days to add, or ask for no expiry.' },
      { status: 400 },
    )
  }

  const code = await db.redemptionCode.findUnique({ where: { id: params.id } })
  if (!code) return NextResponse.json({ error: 'No such code.' }, { status: 404 })

  if (code.status === 'redeemed') {
    return NextResponse.json(
      {
        error:
          'This code has already been redeemed. Its expiry no longer governs anything — ' +
          'if that member needs more time, extend their membership instead.',
      },
      { status: 409 },
    )
  }

  const days = 'neverExpires' in parsed.data ? null : parsed.data.extendDays
  const neverExpires = days === null

  // A code with no expiry cannot be "extended" by a number of days — that would give it an
  // expiry it does not have, which is a reduction wearing the wrong verb. Refused rather
  // than silently applied, because the operator clicking it plainly meant the opposite.
  if (!neverExpires && code.expiresAt === null) {
    return NextResponse.json(
      { error: 'This code already never expires. There is nothing to extend.' },
      { status: 409 },
    )
  }

  const expiresAt = extendedExpiry(code.expiresAt, days)

  const updated = await db.redemptionCode.update({
    where: { id: code.id },
    data: { expiresAt },
    select: { id: true, code: true, expiresAt: true },
  })

  return NextResponse.json({ ok: true, ...updated })
}
