import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { addBillingPeriod } from '@/lib/env'
import { hashPassword, startSession } from '@/lib/auth'
import { normaliseCode } from '@/lib/codes'
import { normalisePhone } from '@/lib/utils'

export const runtime = 'nodejs'

const schema = z.object({
  code: z.string().min(4),
  email: z.string().email(),
  password: z.string().min(10, 'Use at least 10 characters.'),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phoneNumber: z.string().trim().optional(),
})

/**
 * Step 2 of the redemption wizard: claim the code and activate the membership.
 *
 * The whole thing runs in one transaction with a conditional update on the code row, so
 * two people racing the same code cannot both end up with a subscription.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const code = normaliseCode(parsed.data.code)
  const email = parsed.data.email.trim().toLowerCase()
  const phoneNumber = parsed.data.phoneNumber ? normalisePhone(parsed.data.phoneNumber) : null

  const existing = await db.member.findUnique({ where: { email } })
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: 'An account already exists for that email address. Sign in instead.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(parsed.data.password)

  try {
    const member = await db.$transaction(async (tx) => {
      // Conditional on status: the update touches 0 rows if someone else just claimed it.
      const claimed = await tx.redemptionCode.updateMany({
        where: { code, status: 'unused' },
        data: { status: 'redeemed', redeemedAt: new Date() },
      })

      if (claimed.count === 0) {
        throw new RedemptionError('That code is no longer valid. It may have already been used.')
      }

      const now = new Date()
      // First paid period starts now. Stripe members then have this extended
      // automatically by each `invoice.paid`; Cregis members extend it by paying again.
      const renewsAt = addBillingPeriod(now)

      const created = await tx.member.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          firstName: parsed.data.firstName || null,
          lastName: parsed.data.lastName || null,
          phoneNumber,
          role: 'member',
          subscriptionStatus: 'active',
          subscriptionStartedAt: now,
          subscriptionRenewsAt: renewsAt,
          billingProvider: 'cregis',
          source: 'cregis_checkout',
        },
        update: {
          passwordHash,
          firstName: parsed.data.firstName || undefined,
          lastName: parsed.data.lastName || undefined,
          phoneNumber: phoneNumber ?? undefined,
          subscriptionStatus: 'active',
          subscriptionStartedAt: now,
          subscriptionRenewsAt: renewsAt,
        },
      })

      await tx.redemptionCode.update({
        where: { code },
        data: { redeemedByMemberId: created.id },
      })

      return created
    })

    await startSession(member)
    return NextResponse.json({ ok: true, redirectTo: '/dashboard' })
  } catch (error) {
    if (error instanceof RedemptionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[redeem] failed', error)
    return NextResponse.json(
      { error: 'We could not activate your membership. Please contact support.' },
      { status: 500 },
    )
  }
}

class RedemptionError extends Error {}
