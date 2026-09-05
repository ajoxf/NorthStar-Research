import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentMember } from '@/lib/auth'
import { isCodeExpired, normaliseCode } from '@/lib/codes'
import { db } from '@/lib/db'
import { addPeriod } from '@/lib/package-shape'
import { extendedRenewal } from '@/lib/section-grant'
import { sectionName } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ code: z.string().trim().min(4).max(40) })

/**
 * Add a section to an account that already exists.
 *
 * `/api/redeem/complete` cannot do this: it is the account-creation flow, it takes a
 * password, and it refuses an email that already has an account — correctly, because
 * redeeming a second all-access code was never a thing anybody should do. Sections change
 * that. Buying a second one is the ordinary case the whole feature exists for, and it
 * needs a signed-in path rather than a second account.
 *
 * Deliberately narrow. It grants sections and nothing else:
 *
 *   - It never touches `Member.subscriptionStatus`, which *is* the all-access membership.
 *     An all-access member adding a section keeps exactly the membership they had.
 *   - It refuses an all-access code rather than quietly extending a membership. Doing so
 *     would change how renewals behave for people already paying on a live site, which is
 *     not a thing to slip in through a route built for something else.
 */
export async function POST(request: Request) {
  const member = await getCurrentMember()
  if (!member) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your access code.' }, { status: 400 })
  }

  const code = normaliseCode(parsed.data.code)
  const row = await db.redemptionCode.findUnique({
    where: { code },
    include: { section: { include: { topic: true, author: true } } },
  })

  if (!row) return NextResponse.json({ error: 'That code was not recognised.' }, { status: 404 })
  if (row.status !== 'unused') {
    return NextResponse.json({ error: 'That code has already been used.' }, { status: 409 })
  }
  if (isCodeExpired(row)) {
    return NextResponse.json(
      { error: 'That code has expired. Contact support and we will issue you a new one.' },
      { status: 410 },
    )
  }
  if (!row.section) {
    return NextResponse.json(
      {
        error:
          'That code is for a full membership rather than a single section. Contact support and ' +
          'we will apply it to your account.',
      },
      { status: 409 },
    )
  }

  const section = row.section
  const name = sectionName(section)
  const now = new Date()

  const held = await db.entitlement.findUnique({
    where: { memberId_sectionId: { memberId: member.id, sectionId: section.id } },
    select: { renewsAt: true },
  })
  // Extends from whichever is later, so redeeming early never costs the time already held.
  const until = extendedRenewal(held?.renewsAt ?? null, (from) => addPeriod(section.interval, from), now)

  try {
    await db.$transaction(async (tx) => {
      // Conditional on status and expiry inside the transaction: two tabs, or two people
      // holding the same code, and only one of them wins.
      const claimed = await tx.redemptionCode.updateMany({
        where: {
          code,
          status: 'unused',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: {
          status: 'redeemed',
          redeemedAt: now,
          redeemedEmail: member.email,
          redeemedByMemberId: member.id,
        },
      })
      if (claimed.count === 0) throw new Error('claimed')

      await tx.entitlement.upsert({
        where: { memberId_sectionId: { memberId: member.id, sectionId: section.id } },
        create: {
          memberId: member.id,
          sectionId: section.id,
          status: 'active',
          startedAt: now,
          renewsAt: until,
          billingProvider: 'cregis',
        },
        update: { status: 'active', renewsAt: until, cancelAtPeriodEnd: false },
      })
    })
  } catch {
    return NextResponse.json(
      { error: 'That code is no longer valid. It may have just been used.' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, section: name, renewsAt: until })
}
