import { NextResponse } from 'next/server'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { slugify, topicInputSchema, uniqueSlug } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Create a topic — the subject half of a section. */
export async function POST(request: Request) {
  const input = await adminInput(request, topicInputSchema)
  if ('response' in input) return input.response

  const taken = (await db.topic.findMany({ select: { slug: true } })).map((t) => t.slug)
  const topic = await db.topic.create({
    data: {
      name: input.data.name,
      slug: uniqueSlug(slugify(input.data.name), taken),
      blurb: input.data.blurb ?? null,
      sortOrder: input.data.sortOrder,
    },
  })
  return NextResponse.json({ ok: true, topic })
}
