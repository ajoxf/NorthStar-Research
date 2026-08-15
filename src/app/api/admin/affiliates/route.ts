import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { normaliseSlug } from '@/lib/affiliates'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().min(1, 'Give the affiliate a name.').max(120),
  email: emailSchema,
  slug: z.string().trim().max(32).optional(),
  rewardKind: z.enum(['percent', 'fixed', 'free_months']).default('percent'),
  rewardAmount: z.number().int().min(0).max(10_000),
  visitorDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
})

/**
 * Create an affiliate.
 *
 * The slug is the durable part: it goes into bios, videos and posts the affiliate cannot
 * edit later, so it is unique at the database level and never reissued to somebody else,
 * even after an affiliate is closed. If no slug is given, one is derived from the name.
 */
export async function POST(request: Request) {
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
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const data = parsed.data
  const slug = normaliseSlug(data.slug || data.name)
  if (!slug) {
    return NextResponse.json(
      { error: 'That name has no usable characters for a link. Set a slug by hand.' },
      { status: 400 },
    )
  }

  const clash = await db.affiliate.findUnique({ where: { slug } })
  if (clash) {
    return NextResponse.json(
      { error: `The link /join?ref=${slug} is already taken. Choose another slug.` },
      { status: 409 },
    )
  }

  const affiliate = await db.affiliate.create({
    data: {
      slug,
      name: data.name,
      email: data.email.toLowerCase(),
      rewardKind: data.rewardKind,
      rewardAmount: data.rewardAmount,
      visitorDiscountPercent: data.visitorDiscountPercent ?? null,
      notes: data.notes || null,
    },
  })

  return NextResponse.json({ ok: true, id: affiliate.id, slug: affiliate.slug })
}
