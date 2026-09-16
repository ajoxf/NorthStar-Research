import 'server-only'

import { db } from '@/lib/db'

/**
 * Set exactly which items a package grants.
 *
 * Replaces the whole list rather than adding to it, because that is what the form means:
 * the boxes an operator left unticked are items they decided this package should not
 * include, and an add-only write would make removing something impossible from the only
 * screen that can express it.
 *
 * **Existing buyers are untouched.** Entitlements are written once, at redemption, from
 * the package's contents at that moment — so changing this changes what *new* buyers get
 * and never reaches back into what somebody already holds. That is the same rule the
 * price follows, and for the same reason: a customer keeps what they bought.
 *
 * Unknown ids are dropped rather than rejected. The list comes from a form that may have
 * been open while an item was archived elsewhere, and failing the whole save over a stale
 * checkbox would lose the operator's other edits.
 */
export async function setPackageItems(packageId: string, itemIds: string[]): Promise<number> {
  const unique = [...new Set(itemIds)]

  const known = unique.length
    ? (
        await db.item.findMany({
          where: { id: { in: unique } },
          select: { id: true },
        })
      ).map((item) => item.id)
    : []

  await db.$transaction([
    db.packageItem.deleteMany({ where: { packageId, itemId: { notIn: known.length ? known : ['-'] } } }),
    ...known.map((itemId) =>
      db.packageItem.upsert({
        where: { packageId_itemId: { packageId, itemId } },
        update: {},
        create: { packageId, itemId },
      }),
    ),
  ])

  return known.length
}

/** Every item a package could contain, for the admin's checkbox list. */
export async function grantableItemOptions(): Promise<
  { id: string; name: string; kind: 'section' | 'product'; archived: boolean }[]
> {
  const rows = await db.item.findMany({
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, kind: true, archivedAt: true },
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as 'section' | 'product',
    archived: row.archivedAt !== null,
  }))
}
