import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { formatPrice } from '@/lib/package-shape'
import { defaultPackage, packageById } from '@/lib/packages'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Send one person their pricing, or move an enquiry along.
 *
 * The link carries the enquiry's own token, so it opens the join page with the real price
 * and a working checkout while that page stays a plain form for everybody else. The token
 * is not a credential — it reveals a figure, nothing more — which is why it can safely
 * travel by email and be reused if they come back to it.
 *
 * The price is read at send time from the package, never typed here. An operator quoting
 * by hand is exactly how the figure in the email and the figure at checkout come apart.
 */
const schema = z.object({
  action: z.enum(['send', 'close', 'reopen']),
  /** An optional line from the operator, above the payment button. */
  message: z.string().trim().max(1000).optional(),
  /** Quote a package other than the default. */
  packageId: z.string().trim().max(64).optional(),
})

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ error: 'Unrecognised action.' }, { status: 400 })
  }

  const enquiry = await db.pricingEnquiry.findUnique({ where: { id: params.id } })
  if (!enquiry) return NextResponse.json({ error: 'No such enquiry.' }, { status: 404 })

  if (parsed.data.action === 'close') {
    await db.pricingEnquiry.update({ where: { id: enquiry.id }, data: { status: 'closed' } })
    return NextResponse.json({ ok: true })
  }

  if (parsed.data.action === 'reopen') {
    await db.pricingEnquiry.update({
      where: { id: enquiry.id },
      // Back to whichever state the record already earned, rather than always to `new`:
      // an enquiry that was quoted and then set aside is still one that was quoted.
      data: { status: enquiry.invitedAt ? 'invited' : 'new' },
    })
    return NextResponse.json({ ok: true })
  }

  const pkg = parsed.data.packageId
    ? ((await packageById(parsed.data.packageId)) ?? (await defaultPackage()))
    : await defaultPackage()

  const joinUrl = `${appBaseUrl()}/join?invite=${encodeURIComponent(enquiry.inviteToken)}`

  const result = await getNotificationProvider().sendPricingInvite(
    { email: enquiry.email, name: enquiry.name },
    {
      price: formatPrice(pkg.priceCents, pkg.currency),
      interval: pkg.interval,
      joinUrl,
      message: parsed.data.message || null,
    },
  )

  if (result.status === 'failed') {
    // Not marked as invited: the record must not claim a send that did not happen, or the
    // list quietly fills with people waiting for an email nobody will resend.
    return NextResponse.json(
      { error: result.error ?? 'The provider refused the message.' },
      { status: 502 },
    )
  }

  await db.pricingEnquiry.update({
    where: { id: enquiry.id },
    data: { status: 'invited', invitedAt: new Date() },
  })

  return NextResponse.json({ ok: true, joinUrl })
}
