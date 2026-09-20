import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { topicInputSchema } from '@/lib/section-shape'
import { syncItemNames } from '@/lib/section-repair'

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
  /*
   * A rename changes what every section in this topic is called, so the stored item names
   * follow it. Without this the package contents picker keeps offering the old name, and
   * an operator ticking boxes there is reading labels the rest of the site has moved on
   * from.
   */
  if (fields.name !== undefined && fields.name !== existing.name) {
    const sections = await db.section.findMany({
      where: { topicId: params.id },
      select: { id: true },
    })
    await syncItemNames(sections.map((section) => section.id))
  }

  return NextResponse.json({ ok: true, topic })
}

/**
 * Delete a topic that nothing has ever been filed under.
 *
 * The same rule packages follow, and for the same reason. "Nothing is ever deleted" is a
 * promise about *records* — what was published, what somebody bought, who read it. A topic
 * with no sections is none of those things: it is a name somebody typed, usually a
 * mistake, and keeping it forever means the list an operator picks from fills with
 * corrections they cannot clear.
 *
 * One section is enough to refuse. Even an archived one carries reports, and a topic is
 * what those reports are filed under — so retiring is offered instead, which takes it out
 * of every picker while leaving every reference intact.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(_request, z.object({}).optional())
  if ('response' in input) return input.response

  const existing = await db.topic.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, _count: { select: { sections: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'No such topic.' }, { status: 404 })

  if (existing._count.sections > 0) {
    return NextResponse.json(
      {
        error:
          `${existing.name} has ${existing._count.sections} section` +
          `${existing._count.sections === 1 ? '' : 's'} filed under it, so deleting it would ` +
          `orphan what those sections have published. Retire it instead — it disappears from ` +
          `every picker and everything still resolves.`,
      },
      { status: 409 },
    )
  }

  await db.topic.delete({ where: { id: existing.id } })
  return NextResponse.json({ ok: true, deleted: existing.name })
}
