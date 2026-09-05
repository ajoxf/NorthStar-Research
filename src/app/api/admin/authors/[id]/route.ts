import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { authorInputSchema } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit an author, or retire them.
 *
 * Archiving takes them off the contributors page and stops new sections being created for
 * them. It does not touch their existing sections, the reports they wrote, or anybody's
 * subscription — somebody who bought "Energy by Sarah" keeps reading it after Sarah stops
 * filing, and the back catalogue keeps her name on it, because she wrote it.
 */
const schema = authorInputSchema.partial().extend({ archived: z.boolean().optional() })

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const existing = await db.author.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'No such author.' }, { status: 404 })

  const { archived, ...f } = input.data
  // `undefined` means "not sent, leave it"; an empty string has already been normalised to
  // undefined by the schema, so clearing a field is done by sending null explicitly.
  const author = await db.author.update({
    where: { id: params.id },
    data: {
      ...(f.name !== undefined ? { name: f.name } : {}),
      ...(f.headline !== undefined ? { headline: f.headline ?? null } : {}),
      ...(f.bio !== undefined ? { bio: f.bio ?? null } : {}),
      ...(f.photoUrl !== undefined ? { photoUrl: f.photoUrl ?? null } : {}),
      ...(f.websiteUrl !== undefined ? { websiteUrl: f.websiteUrl ?? null } : {}),
      ...(f.linkedinUrl !== undefined ? { linkedinUrl: f.linkedinUrl ?? null } : {}),
      ...(f.xUrl !== undefined ? { xUrl: f.xUrl ?? null } : {}),
      ...(f.credentials !== undefined ? { credentials: f.credentials } : {}),
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    },
  })
  return NextResponse.json({ ok: true, author })
}
