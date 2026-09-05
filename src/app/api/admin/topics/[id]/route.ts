import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { topicInputSchema } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit a topic, or retire it.
 *
 * `archived` rather than delete. Nothing is ever deleted here: a retired topic keeps every
 * section and report already filed under it working, and the only thing that changes is
 * that no new section can be created in it. The slug is deliberately not regenerated on
 * rename — it is in URLs people may have already shared.
 */
const schema = topicInputSchema.partial().extend({ archived: z.boolean().optional() })

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const existing = await db.topic.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'No such topic.' }, { status: 404 })

  const { archived, ...fields } = input.data
  const topic = await db.topic.update({
    where: { id: params.id },
    data: {
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.blurb !== undefined ? { blurb: fields.blurb ?? null } : {}),
      ...(fields.sortOrder !== undefined ? { sortOrder: fields.sortOrder } : {}),
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    },
  })
  return NextResponse.json({ ok: true, topic })
}
