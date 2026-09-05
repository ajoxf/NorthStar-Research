import { NextResponse } from 'next/server'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { authorInputSchema, slugify, uniqueSlug } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create an author profile.
 *
 * Not an account. This creates somebody the site can credit and link to, with no login,
 * no password and no way to reach a member — the desk publishes on their behalf.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, authorInputSchema)
  if ('response' in input) return input.response

  const taken = (await db.author.findMany({ select: { slug: true } })).map((a) => a.slug)
  const author = await db.author.create({
    data: {
      name: input.data.name,
      // Suffixed rather than rejected on collision: two experts genuinely can share a name.
      slug: uniqueSlug(slugify(input.data.name), taken),
      headline: input.data.headline ?? null,
      bio: input.data.bio ?? null,
      photoUrl: input.data.photoUrl ?? null,
      websiteUrl: input.data.websiteUrl ?? null,
      linkedinUrl: input.data.linkedinUrl ?? null,
      xUrl: input.data.xUrl ?? null,
      credentials: input.data.credentials,
    },
  })
  return NextResponse.json({ ok: true, author })
}
