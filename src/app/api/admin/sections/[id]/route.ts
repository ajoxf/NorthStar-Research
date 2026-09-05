import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { sectionInputSchema } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit a section, or take it off the shelf.
 *
 * Two things are deliberately not editable here.
 *
 * **The topic and the author.** A section *is* that pair; changing either would silently
 * move every report filed under it, and hand the revenue for it to a different person.
 * Getting the pair wrong is fixed by archiving the section and making the right one.
 *
 * **Whose access it grants.** Archiving stops new sales; it does not cancel anybody. A
 * member who has paid for this month keeps reading until their period ends, which is what
 * they bought.
 */
const schema = sectionInputSchema
  .omit({ topicId: true, authorId: true })
  .partial()
  .extend({ archived: z.boolean().optional() })

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const existing = await db.section.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'No such section.' }, { status: 404 })

  const { archived, ...f } = input.data

  /*
   * A price change applies to new subscribers only.
   *
   * Existing entitlements are billed by whatever Stripe subscription they were created
   * with, which this does not touch — the same rule packages already follow, and the
   * reason a Stripe price is immutable in the first place.
   */
  const section = await db.section.update({
    where: { id: params.id },
    data: {
      ...(f.displayName !== undefined ? { displayName: f.displayName ?? null } : {}),
      ...(f.description !== undefined ? { description: f.description ?? null } : {}),
      ...(f.priceCents !== undefined ? { priceCents: f.priceCents } : {}),
      ...(f.currency !== undefined ? { currency: f.currency } : {}),
      ...(f.interval !== undefined ? { interval: f.interval } : {}),
      ...(f.sortOrder !== undefined ? { sortOrder: f.sortOrder } : {}),
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    },
    include: { topic: true, author: true },
  })
  return NextResponse.json({ ok: true, section })
}
