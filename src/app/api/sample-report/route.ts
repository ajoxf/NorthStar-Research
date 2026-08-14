import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public sample-report enquiry.
 *
 * Read what this deliberately does NOT do, before changing it:
 *
 *   - It sends nothing to the visitor. It notifies the desk, and a human decides what
 *     to send and to whom.
 *   - It creates no Member row. An enquiry is not a subscriber, and quietly creating
 *     contacts from an unauthenticated form would poison the CRM.
 *   - It never touches report storage. No blob is read, no signed URL is minted, no
 *     report id is accepted as input.
 *
 * All three follow from build spec §5.5: an unauthenticated endpoint must not be able
 * to cause research to be delivered to an arbitrary address. Anyone can POST here with
 * any email. If this ever auto-sends a PDF, the paywall is gone — a stranger could pull
 * the research by typing an address into a public form.
 *
 * Do not "improve" this into auto-sending a report.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.'),
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

  const { name, email, note } = parsed.data

  try {
    const result = await getNotificationProvider().sendSampleReportRequest({
      name,
      email: email.toLowerCase(),
      note: note || undefined,
    })

    if (result.status === 'failed') {
      // The visitor is told it worked either way — a failure here is ours to chase, and
      // the log line is what makes it chaseable. Showing them an error would just make
      // them submit again into the same broken pipe.
      console.error(
        `[sample-report] notification failed for ${email}: ${result.error} — request was: ` +
          `${name} <${email}>${note ? ` | ${note}` : ''}`,
      )
    }
  } catch (error) {
    console.error(
      `[sample-report] notification threw for ${email} — request was: ${name} <${email}>`,
      error,
    )
  }

  return NextResponse.json({ ok: true })
}
