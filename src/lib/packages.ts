import 'server-only'

import type { Package } from '@prisma/client'

import { db } from '@/lib/db'
import {
  FALLBACK_PACKAGE,
  type BillingIntervalValue,
  type PackageShape,
  slugifyPackage,
  sortPackages,
} from '@/lib/package-shape'

/**
 * Reading packages out of the database, with a working site when there are none.
 *
 * Every function here falls back to {@link FALLBACK_PACKAGE} — the $199 plan that was
 * hard-coded before this existed — when no package has been created. That is what makes
 * this feature additive: on the day it ships the site sells exactly what it sold the day
 * before, and it only changes when an operator deliberately changes it.
 *
 * Nothing here filters archived packages out of a *lookup*. An archived package must
 * still resolve, or a member subscribed to it would suddenly have no plan; it is only
 * removed from the lists people can buy from.
 */

export function toShape(row: Package): PackageShape {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    interval: row.interval as BillingIntervalValue,
    stripePriceId: row.stripePriceId,
    stripeProductId: row.stripeProductId,
    features: row.features,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
    archivedAt: row.archivedAt,
  }
}

/** Everything, archived included. The admin list. */
export async function allPackages(): Promise<PackageShape[]> {
  const rows = await db.package.findMany()
  return sortPackages(rows.map(toShape))
}

/** What can be bought right now. Empty means "nothing has been created" — see below. */
export async function sellablePackages(): Promise<PackageShape[]> {
  const rows = await db.package.findMany({ where: { archivedAt: null } })
  return sortPackages(rows.map(toShape))
}

/**
 * What to offer when the buyer has not chosen.
 *
 * The chain is deliberate: the package explicitly marked default, then the first
 * sellable one, then the built-in plan. The middle step matters — an operator who
 * archives the default package should not take the join page's price down with it.
 */
export async function defaultPackage(): Promise<PackageShape> {
  const sellable = await sellablePackages()
  return sellable.find((pkg) => pkg.isDefault) ?? sellable[0] ?? FALLBACK_PACKAGE
}

/**
 * The package a checkout is for, from whatever the browser sent.
 *
 * Accepts an id or a slug because both appear in the wild — the join page posts an id,
 * a shared `/join?package=pro` link carries a slug. An unknown or archived value falls
 * back to the default rather than erroring: someone following a stale link should still
 * be able to buy something, and quietly selling them the wrong thing is prevented by the
 * join page showing what they are buying before they pay.
 */
export async function packageForCheckout(idOrSlug?: string | null): Promise<PackageShape> {
  if (!idOrSlug) return defaultPackage()

  const row = await db.package.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  })

  if (!row || row.archivedAt) return defaultPackage()
  return toShape(row)
}

/**
 * How long one paid period is for whoever holds this package.
 *
 * Falls back to the default package's interval — and ultimately to a month — because a
 * member with no package is a member from before packages existed, and they were sold a
 * month. Guessing longer would give away access nobody paid for.
 */
export async function intervalForPackage(id: string | null): Promise<BillingIntervalValue> {
  if (!id) return (await defaultPackage()).interval
  const row = await db.package.findUnique({ where: { id }, select: { interval: true } })
  return (row?.interval as BillingIntervalValue) ?? (await defaultPackage()).interval
}

export async function packageById(id: string): Promise<PackageShape | null> {
  const row = await db.package.findUnique({ where: { id } })
  return row ? toShape(row) : null
}

/**
 * How many members and orders point at a package.
 *
 * This is what decides whether "delete" means archive or remove. A package nothing has
 * ever referenced carries no history, so deleting it loses nothing; one that has taken
 * even a single order is a record of what somebody bought, and that is kept.
 */
export async function packageUsage(id: string): Promise<{ members: number; orders: number }> {
  const [members, orders] = await Promise.all([
    db.member.count({ where: { packageId: id } }),
    db.checkoutOrder.count({ where: { packageId: id } }),
  ])
  return { members, orders }
}

/** Counts for every package at once, so the admin list is one query rather than N. */
export async function packageUsageMap(): Promise<Record<string, { members: number; orders: number }>> {
  const [members, orders] = await Promise.all([
    db.member.groupBy({ by: ['packageId'], _count: { _all: true } }),
    db.checkoutOrder.groupBy({ by: ['packageId'], _count: { _all: true } }),
  ])

  const usage: Record<string, { members: number; orders: number }> = {}
  const bump = (id: string | null, key: 'members' | 'orders', count: number) => {
    if (!id) return
    usage[id] ??= { members: 0, orders: 0 }
    usage[id][key] += count
  }

  for (const row of members) bump(row.packageId, 'members', row._count._all)
  for (const row of orders) bump(row.packageId, 'orders', row._count._all)
  return usage
}

/**
 * A slug that is free, derived from the name.
 *
 * Collisions get a numeric suffix rather than an error, because two packages called
 * "Pro (annual)" and "Pro (monthly)" both slugify to `pro-annual`-ish shapes and an
 * operator should not have to think about URL handles to create a second package.
 */
export async function uniqueSlug(name: string, exceptId?: string): Promise<string> {
  const base = slugifyPackage(name) || 'package'

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const clash = await db.package.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash || clash.id === exceptId) return candidate
  }

  // 50 packages sharing one name is not a real scenario, but silently reusing a slug
  // would be, so this stays deterministic and unique rather than clever.
  return `${base}-${Date.now()}`
}

/**
 * Make one package the default, atomically.
 *
 * Both statements in one transaction: a crash between them would otherwise leave the
 * site with no default at all, and `defaultPackage()` would start answering with
 * whatever happens to sort first.
 */
export async function setDefaultPackage(id: string): Promise<void> {
  await db.$transaction([
    db.package.updateMany({ where: { id: { not: id } }, data: { isDefault: false } }),
    db.package.update({ where: { id }, data: { isDefault: true, archivedAt: null } }),
  ])
}
