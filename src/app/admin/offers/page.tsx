import type { Metadata } from 'next'

import { OfferManager } from '@/app/admin/offers/offer-manager'
import { Eyebrow } from '@/components/band'
import { db } from '@/lib/db'
import { allOffers } from '@/lib/offers'
import { sectionName } from '@/lib/section-shape'

export const metadata: Metadata = { title: 'Discounts' }
export const dynamic = 'force-dynamic'

/**
 * Sales and codes, in one place.
 *
 * Only live sections and packages are offered to pick from. An archived one cannot be
 * bought, so scoping a discount to it would be a campaign that can never apply — and an
 * operator would reasonably read its presence in the list as meaning it could.
 */
export default async function OffersPage() {
  const [offers, sections, packages] = await Promise.all([
    allOffers(),
    db.section.findMany({
      where: { archivedAt: null },
      include: { topic: true, author: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    }),
    db.package.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ])

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Eyebrow>Configuration</Eyebrow>
      <h1 className="mt-4 font-display text-[32px] font-medium leading-[1.05] tracking-[-0.04em]">
        Discounts
      </h1>
      <p className="mt-3 max-w-2xl text-[18px] leading-relaxed text-ink-dim">
        A percentage off, for everyone or for whoever has the code. The list price is never
        edited — the charge is worked out from it each time — so a discount that ends puts
        the real price back without anybody having to remember to.
      </p>

      <div className="mt-8">
        <OfferManager
          offers={offers.map((offer) => ({
            id: offer.id,
            name: offer.name,
            code: offer.code,
            percentOff: offer.percentOff,
            duration: offer.duration,
            // Serialised for the client component; Dates do not survive the boundary.
            startsAt: offer.startsAt?.toISOString() ?? null,
            endsAt: offer.endsAt?.toISOString() ?? null,
            maxRedemptions: offer.maxRedemptions,
            redeemedCount: offer.redeemedCount,
            appliesToEverything: offer.appliesToEverything,
            archived: offer.archivedAt !== null,
            sectionIds: offer.sectionIds,
            packageIds: offer.packageIds,
          }))}
          sections={sections.map((section) => ({
            id: section.id,
            name: sectionName(section),
            priceCents: section.priceCents,
            currency: section.currency,
          }))}
          packages={packages.map((pkg) => ({
            id: pkg.id,
            name: pkg.name,
            priceCents: pkg.priceCents,
            currency: pkg.currency,
          }))}
        />
      </div>
    </div>
  )
}
