import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { setPricingMode } from '@/lib/pricing-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Show the price publicly, or take enquiries and quote individually. */
const schema = z.object({ mode: z.enum(['public', 'enquiry']) })

export async function PATCH(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a pricing mode.' }, { status: 400 })
  }

  await setPricingMode(parsed.data.mode, admin.id)
  return NextResponse.json({ ok: true, mode: parsed.data.mode })
}
