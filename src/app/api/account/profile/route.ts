import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { syncProductAccess } from '@/lib/product-auth'
import { getCurrentMember, hashPassword, readSession, verifyPassword } from '@/lib/auth'
import {
  NEEDS_CURRENT_PASSWORD,
  canSetPasswordWithoutCurrent,
} from '@/lib/password-reset-shape'

export const runtime = 'nodejs'

const schema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phoneNumber: z.string().trim().max(32).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(10).optional(),
})

export async function PATCH(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const data: Record<string, unknown> = {
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
    // Contact detail for the desk, not a delivery channel — WhatsApp delivery is
    // descoped, so nothing is ever sent to this number.
    phoneNumber: parsed.data.phoneNumber ? parsed.data.phoneNumber : null,
  }

  if (parsed.data.newPassword) {
    /*
     * Normally this requires proving the current password — a hijacked session should not
     * be able to lock the real member out with one click.
     *
     * Two sessions are exempt, and the reasoning is in lib/password-reset-shape.ts: an
     * account with no password has nothing to prove, and somebody who signed in through
     * an email link in the last half hour has just proved control of the address, which
     * is precisely what a reset email proves. Without that second case this site has no
     * password reset at all.
     */
    const session = await readSession()
    const exempt =
      session !== null &&
      canSetPasswordWithoutCurrent({
        hasPassword: member.passwordHash !== null,
        via: session.via,
        viaAt: session.viaAt,
      })

    if (!exempt) {
      if (!parsed.data.currentPassword || !member.passwordHash) {
        return NextResponse.json({ error: NEEDS_CURRENT_PASSWORD }, { status: 400 })
      }
      const ok = await verifyPassword(parsed.data.currentPassword, member.passwordHash)
      if (!ok) {
        return NextResponse.json(
          { error: 'Your current password is not correct.' },
          { status: 400 },
        )
      }
    }

    data.passwordHash = await hashPassword(parsed.data.newPassword)
  }

  await db.member.update({ where: { id: member.id }, data })

  /*
   * Carry a new password through to any product they hold.
   *
   * The whole point of the bridge is one set of credentials for both sites. A password
   * changed here and not there would quietly split them in two, and the person would
   * find out the next time they opened the product — with the old password, which they
   * have just replaced and may no longer remember.
   */
  if (parsed.data.newPassword) {
    await syncProductAccess(member.id, { password: parsed.data.newPassword })
  }

  return NextResponse.json({ ok: true })
}
