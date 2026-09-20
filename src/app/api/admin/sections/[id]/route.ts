import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { syncItemNames } from '@/lib/section-repair'
import { clearableUrl, sectionInputSchema } from '@/lib/section-shape'

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
  .extend({
    archived: z.boolean().optional(),
    // Overrides the create form's version so the picture can actually be taken off: there
    // `''` means "none given", here it has to mean "remove the one that is there".
    imageUrl: clearableUrl,
  })

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
      /*
       * `null` clears it, `undefined` leaves it alone. The editor sends null when an
       * operator removes the picture; a partial PATCH from anywhere else must not wipe
       * artwork it never mentioned.
       */
      ...(f.imageUrl !== undefined ? { imageUrl: f.imageUrl } : {}),
      // Same rule: null takes the cadence off the page, undefined leaves it.
      ...(f.cadence !== undefined ? { cadence: f.cadence } : {}),
      ...(f.priceCents !== undefined ? { priceCents: f.priceCents } : {}),
      ...(f.currency !== undefined ? { currency: f.currency } : {}),
      ...(f.interval !== undefined ? { interval: f.interval } : {}),
      ...(f.sortOrder !== undefined ? { sortOrder: f.sortOrder } : {}),
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    },
    include: { topic: true, author: true },
  })
  // A new display name renames the section everywhere it is shown; the stored item name
  // follows so the package contents picker does not keep offering the old one.
  if (f.displayName !== undefined) await syncItemNames([existing.id])

  return NextResponse.json({ ok: true, section })
}

/**
 * Delete a section nothing has ever been sold or published through.
 *
 * The same rule packages and topics follow. "Nothing is ever deleted" is a promise about
 * records — what was published, what somebody bought, who read it. A section created by
 * mistake, with no reports filed under it and nobody subscribed to it, is none of those:
 * it is a name and a price, and leaving it on the shelf forever means every picker in the
 * admin fills with corrections that cannot be cleared.
 *
 * Anything that makes it a record refuses the delete and is named in the refusal, so an
 * operator is told which of the four it was rather than a flat no. Archiving stays
 * available for all of them: it takes the section off sale and leaves every reference
 * working, which is what a real product that has run its course needs.
 *
 * Its item goes with it, but only if the item is equally unused. An item with entitlements
 * behind it is somebody's access, and an item ticked onto a package is part of what that
 * package sells — either one is a record, and the section row going away does not make
 * them any less so.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, z.object({}).optional())
  if ('response' in input) return input.response

  const existing = await db.section.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      slug: true,
      itemId: true,
      _count: { select: { reports: true, entitlements: true, orders: true, codes: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'No such section.' }, { status: 404 })

  const held = [
    ['report', existing._count.reports],
    ['subscriber', existing._count.entitlements],
    ['order', existing._count.orders],
    ['access code', existing._count.codes],
  ].filter(([, count]) => (count as number) > 0) as [string, number][]

  if (held.length > 0) {
    const parts = held.map(([noun, n]) => `${n} ${noun}${n === 1 ? '' : 's'}`)
    return NextResponse.json(
      {
        error:
          `This section has ${parts.join(' and ')} behind it, so it is a record of what was ` +
          `published and bought. Retire it instead — it comes off sale and everyone who holds ` +
          `it keeps reading.`,
      },
      { status: 409 },
    )
  }

  /*
   * The item first, and only when nothing else points at it — a delete would otherwise
   * fail on the foreign key from the section, and an orphaned item would sit in the
   * package contents picker forever offering a section that no longer exists.
   */
  const itemId = existing.itemId
  await db.section.delete({ where: { id: existing.id } })

  if (itemId) {
    const itemUsage = await db.item.findUnique({
      where: { id: itemId },
      select: { _count: { select: { entitlements: true, packages: true, accounts: true } } },
    })
    const itemUnused =
      itemUsage !== null &&
      itemUsage._count.entitlements === 0 &&
      itemUsage._count.packages === 0 &&
      itemUsage._count.accounts === 0
    if (itemUnused) await db.item.delete({ where: { id: itemId } })
  }

  return NextResponse.json({ ok: true, deleted: existing.slug })
}
