import { NextResponse } from 'next/server'

import { adminInput } from '@/app/api/admin/_admin-route'
import { db } from '@/lib/db'
import { offerInputSchema } from '@/lib/offer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create an offer — a public sale, or a code.
 *
 * The scope rows are written in the same transaction as the offer itself. A half-written
 * offer is one with no scope, and an offer with no scope and `appliesToEverything` off
 * discounts nothing — harmless, but it would sit in the list looking like a campaign that
 * was running. One transaction means it either exists properly or not at all.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, offerInputSchema)
  if ('response' in input) return input.response
  const data = input.data
  // `.default([])` on a schema wrapped in `.refine()` infers as optional, so these are
  // normalised once here rather than guarded at four call sites.
  const sectionIds = data.sectionIds ?? []
  const packageIds = data.packageIds ?? []

  if (data.code) {
    const clash = await db.offer.findUnique({ where: { code: data.code }, select: { id: true } })
    if (clash) {
      return NextResponse.json(
        { error: `The code ${data.code} is already in use. Pick another.` },
        { status: 409 },
      )
    }
  }

  const offer = await db.$transaction(async (tx) => {
    const created = await tx.offer.create({
      data: {
        name: data.name,
        code: data.code,
        percentOff: data.percentOff,
        duration: data.duration,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        maxRedemptions: data.maxRedemptions,
        appliesToEverything: data.appliesToEverything,
      },
    })
    if (sectionIds.length > 0) {
      await tx.offerSection.createMany({
        data: sectionIds.map((sectionId) => ({ offerId: created.id, sectionId })),
        skipDuplicates: true,
      })
    }
    if (packageIds.length > 0) {
      await tx.offerPackage.createMany({
        data: packageIds.map((packageId) => ({ offerId: created.id, packageId })),
        skipDuplicates: true,
      })
    }
    return created
  })

  return NextResponse.json({ ok: true, offer })
}
