import { NextResponse } from 'next/server'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { sectionInputSchema, sectionSlug, uniqueSlug } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create a section — one topic, by one author.
 *
 * No Stripe price is created here. A section is a saleable thing only once checkout knows
 * how to charge for it, and that arrives with the checkout work; until then a section can
 * be set up, priced and have reports filed under it without anything being on sale. That
 * ordering is deliberate on a live site: configuration first, commerce second.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, sectionInputSchema)
  if ('response' in input) return input.response

  const [topic, author] = await Promise.all([
    db.topic.findUnique({ where: { id: input.data.topicId } }),
    db.author.findUnique({ where: { id: input.data.authorId } }),
  ])
  if (!topic) return NextResponse.json({ error: 'That topic no longer exists.' }, { status: 400 })
  if (!author) return NextResponse.json({ error: 'That author no longer exists.' }, { status: 400 })

  // The unique constraint would catch this, but a Prisma constraint error reaches an
  // operator as an opaque string; naming the section they already have is more use.
  const clash = await db.section.findFirst({
    where: { topicId: topic.id, authorId: author.id },
  })
  if (clash) {
    return NextResponse.json(
      { error: `${topic.name} by ${author.name} already exists.` },
      { status: 409 },
    )
  }

  const taken = (await db.section.findMany({ select: { slug: true } })).map((s) => s.slug)
  const section = await db.section.create({
    data: {
      slug: uniqueSlug(sectionSlug(topic.name, author.name), taken),
      topicId: topic.id,
      authorId: author.id,
      displayName: input.data.displayName ?? null,
      description: input.data.description ?? null,
      priceCents: input.data.priceCents,
      currency: input.data.currency,
      interval: input.data.interval,
      sortOrder: input.data.sortOrder,
    },
    include: { topic: true, author: true },
  })
  return NextResponse.json({ ok: true, section })
}
