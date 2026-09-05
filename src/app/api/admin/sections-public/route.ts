import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { setSectionsPublic } from '@/lib/sections-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ visible: z.boolean() })

/** Show or hide the whole public sections surface. Visibility only — never access. */
export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'Say whether it should be visible.' }, { status: 400 })
  }

  await setSectionsPublic(parsed.data.visible, admin.id)
  return NextResponse.json({ ok: true, visible: parsed.data.visible })
}
