import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'

import { db } from '@/lib/db'
import { emailSchema } from '@/lib/validation'
import { resolveContactNumbers } from '@/lib/contact-numbers'
import { referralSlugFromCookie } from '@/lib/referral-attribution'
import { optionalEnv } from '@/lib/env'
import { DEFAULT_EMAIL_FROM } from '@/lib/notifications/from'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Somebody asking what it costs.
 *
 * Public and unauthenticated by necessity, so it is written to be dull under abuse: it
 * creates one row, sends the desk one notification, and returns the same answer whether
 * or not the address has enquired before. A prospect must never be told "you already
 * asked" — that leaks who is on the list to anyone who guesses an address.
 *
 * The reply to the enquirer is deliberately *not* sent from here. Pricing is sent by an
 * operator, individually, from the admin — that is the entire point of the enquiry mode,
 * and auto-replying with a price would quietly undo it.
 */
const schema = z.object({
  name: z.string().trim().min(2, 'Tell us your name.').max(80),
  email: emailSchema,
  phoneNumber: z
    .string({ required_error: 'Enter a mobile number, including the country code.' })
    .trim()
    .min(6, 'Enter a mobile number, including the country code.')
    .max(32),
  whatsappSameAsPhone: z.boolean().default(true),
  whatsappNumber: z.string().trim().max(32).optional(),
  note: z.string().trim().max(1000).optional(),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const email = parsed.data.email.trim().toLowerCase()
  const numbers = resolveContactNumbers({
    phoneNumber: parsed.data.phoneNumber,
    whatsappSameAsPhone: parsed.data.whatsappSameAsPhone,
    whatsappNumber: parsed.data.whatsappNumber,
  })

  // A second enquiry updates the first rather than stacking duplicates in the desk's
  // list. The token is kept so a link already sent still works.
  const existing = await db.pricingEnquiry.findFirst({ where: { email } })

  const enquiry = existing
    ? await db.pricingEnquiry.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          phoneNumber: numbers.phoneNumber,
          whatsappNumber: numbers.whatsappNumber,
          note: parsed.data.note || existing.note,
        },
      })
    : await db.pricingEnquiry.create({
        data: {
          name: parsed.data.name,
          email,
          phoneNumber: numbers.phoneNumber,
          whatsappNumber: numbers.whatsappNumber,
          note: parsed.data.note || null,
          inviteToken: randomBytes(24).toString('base64url'),
          referralSlug: referralSlugFromCookie(),
        },
      })

  // Tell the desk. Never throws: the enquiry is recorded either way, and it is visible in
  // the admin whether or not the notification lands.
  try {
    const to = optionalEnv('SAMPLE_REPORT_REQUEST_TO', optionalEnv('EMAIL_FROM', DEFAULT_EMAIL_FROM))
    await getNotificationProvider().sendSampleReportRequest({
      name: `${parsed.data.name} — pricing enquiry`,
      email,
      note:
        `Pricing enquiry from ${parsed.data.name} <${email}>.\n` +
        `Mobile: ${numbers.phoneNumber ?? '—'}\n` +
        `WhatsApp: ${numbers.whatsappNumber ?? (numbers.whatsappOptIn ? numbers.phoneNumber : '—')}\n\n` +
        `${parsed.data.note ?? 'No message.'}\n\n` +
        `Send them pricing from the admin: /admin/enquiries`,
    })
    void to
  } catch (error) {
    console.error('[pricing-enquiry] desk notification failed', error)
  }

  return NextResponse.json({ ok: true, id: enquiry.id })
}
