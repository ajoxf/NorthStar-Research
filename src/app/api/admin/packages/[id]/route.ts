import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { packageInputSchema } from '@/lib/package-shape'
import { packageById, packageUsage, setDefaultPackage, uniqueSlug } from '@/lib/packages'
import { resolveStripePrice } from '@/app/api/admin/packages/resolve-price'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit a package, or change its state.
 *
 * `action` covers the state changes (archive, restore, make default) and the full body
 * covers an edit. They are one endpoint because they are one resource, but they are
 * distinct operations: archiving is not "editing archivedAt", and a form that could
 * accidentally submit it as a field is a form that can withdraw a product by mistake.
 */
const actionSchema = z.object({
  action: z.enum(['archive', 'restore', 'make_default']),
})

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const existing = await packageById(params.id)
  if (!existing) return NextResponse.json({ error: 'No such package.' }, { status: 404 })

  const body = await request.json().catch(() => null)

  const action = actionSchema.safeParse(body)
  if (action.success) {
    return handleAction(existing.id, existing.isDefault, action.data.action)
  }

  const parsed = packageInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }

  const input = parsed.data

  const price = await resolveStripePrice({
    sellByCard: input.sellByCard,
    pastedPriceId: input.stripePriceId,
    desired: { ...input, name: input.name },
    current: { stripePriceId: existing.stripePriceId, stripeProductId: existing.stripeProductId },
  })
  if (!price.ok) return NextResponse.json({ error: price.error }, { status: 400 })

  await db.package.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      // The slug only moves when the name does, and never onto one already taken. It is
      // in shared `/join?package=…` links, so churning it would break them for no gain.
      slug: input.name === existing.name ? existing.slug : await uniqueSlug(input.name, existing.id),
      description: input.description || null,
      priceCents: input.priceCents,
      currency: input.currency,
      interval: input.interval,
      stripePriceId: price.stripePriceId,
      stripeProductId: price.stripeProductId,
      features: input.features,
      sortOrder: input.sortOrder,
    },
  })

  return NextResponse.json({ ok: true })
}

async function handleAction(id: string, isDefault: boolean, action: 'archive' | 'restore' | 'make_default') {
  if (action === 'make_default') {
    await setDefaultPackage(id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'restore') {
    await db.package.update({ where: { id }, data: { archivedAt: null } })
    return NextResponse.json({ ok: true })
  }

  // Archiving the default would leave the site falling back to whatever sorts first,
  // which is not a pricing decision anybody made. Choose the replacement first.
  if (isDefault) {
    const alternative = await db.package.findFirst({
      where: { id: { not: id }, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    })

    if (!alternative) {
      return NextResponse.json(
        {
          error:
            'This is the only package on sale. Create the one that replaces it first — archiving it ' +
            'would leave the join page with nothing to sell.',
        },
        { status: 409 },
      )
    }

    await setDefaultPackage(alternative.id)
  }

  await db.package.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } })
  return NextResponse.json({ ok: true })
}

/**
 * Remove a package outright — only when nothing has ever referenced it.
 *
 * "Nothing is ever deleted" is the standing rule here, and it is about history: a
 * package someone bought is the record of what they bought, and a row that vanishes
 * turns their membership and their order into orphans. So a package with any member or
 * order behind it can only be archived, which withdraws it from sale while every
 * reference to it still resolves.
 *
 * A package nothing has touched is different. It is a draft — a typo, a test, a price
 * that was never offered — and deleting it loses nothing that ever happened.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const existing = await packageById(params.id)
  if (!existing) return NextResponse.json({ error: 'No such package.' }, { status: 404 })

  const usage = await packageUsage(existing.id)
  if (usage.members > 0 || usage.orders > 0) {
    return NextResponse.json(
      {
        error:
          `This package has ${usage.members} member${usage.members === 1 ? '' : 's'} and ` +
          `${usage.orders} order${usage.orders === 1 ? '' : 's'} behind it, so it is a record of what ` +
          `people bought. Archive it instead — it stops being sold and everything still resolves.`,
      },
      { status: 409 },
    )
  }

  const remaining = await db.package.count({ where: { id: { not: existing.id }, archivedAt: null } })
  if (existing.isDefault && remaining === 0) {
    return NextResponse.json(
      { error: 'This is the only package on sale. Create its replacement before deleting it.' },
      { status: 409 },
    )
  }

  await db.package.delete({ where: { id: existing.id } })

  if (existing.isDefault) {
    const next = await db.package.findFirst({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    })
    if (next) await setDefaultPackage(next.id)
  }

  return NextResponse.json({ ok: true })
}
