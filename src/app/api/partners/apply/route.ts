import { NextResponse } from 'next/server'
import { z } from 'zod'

import { applyAsPartner } from '@/lib/partner-application'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(200),
  slug: z.string().trim().min(1, 'Choose a link name.').max(40),
  website: z.string().trim().max(300).optional(),
  promotion: z.string().trim().max(2000).optional(),
  invite: z.string().trim().max(64).optional(),
  /** A field people never see. A bot that fills every input fills this one too. */
  company: z.string().max(0).optional(),
})

/**
 * The public partner application.
 *
 * What it deliberately does not do: it grants nothing, links no member account and sends
 * nothing to the applicant's address — that address is unverified input from a public
 * form. It records a pending application and tells the admins; a person decides.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    // The trap field: answer as if it worked, and record nothing.
    if (issue?.path[0] === 'company') return NextResponse.json({ ok: true })
    return NextResponse.json({ error: issue?.message ?? 'Check the details you entered.', field: issue?.path[0] }, { status: 400 })
  }

  const result = await applyAsPartner(parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error, field: result.field }, { status: result.status })
  return NextResponse.json({ ok: true })
}
