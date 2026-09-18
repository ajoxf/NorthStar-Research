import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import {
  entitlementFields,
  extendedRenewal,
  grantFor,
  memberSubscriptionFields,
  monthsGranted,
} from '@/lib/grant'
import { addPeriod, isFallbackPackage } from '@/lib/package-shape'
import { defaultPackage, packageById } from '@/lib/packages'
import { hashPassword, startSession } from '@/lib/auth'
import { safeNext } from '@/lib/oauth'
import { latestPublishedReport } from '@/lib/latest-report'
import { isCodeExpired, normaliseCode } from '@/lib/codes'
import { resolveContactNumbers } from '@/lib/contact-numbers'
import { recordReferralSignup, referralSlugFromCookie } from '@/lib/referral-attribution'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'

const schema = z.object({
  /** Where to land after activating. Same-origin paths only — see safeNext. */
  next: z.string().nullable().optional(),
  code: z.string().min(4),
  email: emailSchema,
  password: z.string().min(10, 'Use at least 10 characters.'),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  /*
   * Required at sign-up.
   *
   * It is a contact detail, not a delivery channel — reports go by email only. The desk
   * needs a way to reach a paying member that does not depend on an email landing in a
   * spam folder, and asking later means never getting it.
   *
   * Redemption is the one point every member passes through, whichever way they arrived
   * — card, crypto, gifted code or referral — so it is the only place a number can be
   * asked for once and captured from everybody.
   */
  phoneNumber: z
    // `required_error` matters: a *missing* field never reaches .min(), so without this
    // an omitted number is reported to the member as the bare word "Required".
    .string({ required_error: 'Enter your mobile number, including the country code.' })
    .trim()
    .min(6, 'Enter your mobile number, including the country code.')
    .max(32, 'That number is too long.'),
  /** False when they run WhatsApp on a different line. Defaults to the common case. */
  whatsappSameAsPhone: z.boolean().default(true),
  whatsappNumber: z.string().trim().max(32, 'That number is too long.').optional(),
})

/**
 * Step 2 of the redemption wizard: claim the code and activate the membership.
 *
 * The whole thing runs in one transaction with a conditional update on the code row, so
 * two people racing the same code cannot both end up with a subscription.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const code = normaliseCode(parsed.data.code)
  const email = parsed.data.email
  const numbers = resolveContactNumbers({
    phoneNumber: parsed.data.phoneNumber,
    whatsappSameAsPhone: parsed.data.whatsappSameAsPhone,
    whatsappNumber: parsed.data.whatsappNumber,
  })

  const existing = await db.member.findUnique({ where: { email } })
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: 'An account already exists for that email address. Sign in instead.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(parsed.data.password)

  // Which membership this code grants, read before the claim below. The code's package
  // never changes, so reading it outside the transaction races with nothing — and a
  // gifted code, which carries none, falls back to whatever is currently on sale.
  const codeGrant = await db.redemptionCode.findUnique({
    where: { code },
    select: { packageId: true, sectionId: true, grantMonths: true, grantsOpenEnded: true },
  })
  const chosen = codeGrant?.packageId ? await packageById(codeGrant.packageId) : null
  const pkg = chosen ?? (await defaultPackage())
  const packageId = isFallbackPackage(pkg) ? null : pkg.id

  /*
   * A code naming a section grants that section and nothing else.
   *
   * The distinction is load-bearing rather than cosmetic: Member.subscriptionStatus *is*
   * the all-access membership, so a section buyer must leave this route with an
   * Entitlement row and those columns untouched. `memberSubscriptionFields` returns an
   * empty object for a section grant, which is what enforces that below.
   */
  const section = codeGrant?.sectionId
    ? await db.section.findUnique({
        where: { id: codeGrant.sectionId },
        select: { id: true, interval: true, itemId: true },
      })
    : null

  /*
   * The Stripe subscription behind a section purchase, if there was one.
   *
   * Attached to the entitlement rather than to the member, so a later invoice or
   * cancellation for this subscription is routed to this section and not to whatever
   * membership the person also holds.
   */
  const paidOrder = codeGrant?.sectionId
    ? await db.redemptionCode
        .findUnique({ where: { code }, select: { cregisOrderId: true } })
        .then((row) =>
          row?.cregisOrderId
            ? db.checkoutOrder.findUnique({
                where: { cregisOrderId: row.cregisOrderId },
                select: { stripeSubscriptionId: true, provider: true },
              })
            : null,
        )
    : null
  /*
   * What this package grants, beyond the legacy membership columns.
   *
   * Empty for the built-in fallback package, which has no row to hang items off, and empty
   * for any package nobody has ticked anything onto — so this changes nothing until an
   * operator deliberately says a package includes something.
   */
  const packageItemIds = packageId
    ? (
        await db.packageItem.findMany({
          where: { packageId, item: { archivedAt: null } },
          select: { itemId: true },
        })
      ).map((row) => row.itemId)
    : []

  const grant = grantFor(
    { sectionId: codeGrant?.sectionId ?? null },
    { interval: pkg.interval, packageId, itemIds: packageItemIds },
    section,
  )

  try {
    const member = await db.$transaction(async (tx) => {
      // Conditional on status *and* expiry, both inside the transaction: the update
      // touches 0 rows if someone else just claimed it, or if it lapsed between the
      // validate call and this one. The email is written here rather than only onto the
      // Member, so every activation is traceable from the code row itself.
      const claimedAt = new Date()
      const claimed = await tx.redemptionCode.updateMany({
        where: {
          code,
          status: 'unused',
          OR: [{ expiresAt: null }, { expiresAt: { gt: claimedAt } }],
        },
        data: { status: 'redeemed', redeemedAt: claimedAt, redeemedEmail: email },
      })

      if (claimed.count === 0) {
        // Distinguish the two so the person is told something they can act on.
        const current = await tx.redemptionCode.findUnique({ where: { code } })
        throw new RedemptionError(
          current && current.status === 'unused' && isCodeExpired(current, claimedAt)
            ? 'This code has expired. Contact support and we will issue you a new one.'
            : 'That code is no longer valid. It may have already been used.',
        )
      }

      const now = new Date()
      // First paid period starts now. Stripe members then have this extended
      // automatically by each `invoice.paid`; Cregis members extend it by paying again.
      const renewsAt = addPeriod(grant.interval, now)
      // How long this code grants, decided once and used by every entitlement it writes.
      const months = monthsGranted(codeGrant ?? { grantMonths: null, grantsOpenEnded: false }, grant.interval)
      const subscription = memberSubscriptionFields(grant, now, renewsAt)

      const created = await tx.member.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          firstName: parsed.data.firstName || null,
          lastName: parsed.data.lastName || null,
          phoneNumber: numbers.phoneNumber,
          whatsappNumber: numbers.whatsappNumber,
          whatsappOptIn: numbers.whatsappOptIn,
          role: 'member',
          billingProvider: 'cregis',
          source: 'cregis_checkout',
          // Empty for a section grant, so a section buyer is never marked all-access.
          ...subscription,
        },
        update: {
          passwordHash,
          firstName: parsed.data.firstName || undefined,
          lastName: parsed.data.lastName || undefined,
          phoneNumber: numbers.phoneNumber ?? undefined,
          whatsappNumber: numbers.whatsappNumber ?? undefined,
          whatsappOptIn: numbers.whatsappOptIn || undefined,
          // Also empty for a section grant — an existing all-access member who buys a
          // section must not have their own membership rewritten by it.
          ...subscription,
        },
      })

      /*
       * The entitlement, for a section grant.
       *
       * Upserted on (memberId, sectionId): re-redeeming for a section somebody already
       * holds extends it rather than creating a second row, and the new date is measured
       * from whichever is later — now, or what they already had — so renewing early never
       * costs them the time they had left.
       */
      const entitlement = entitlementFields(grant, now, renewsAt)
      if (entitlement) {
        const held = await tx.entitlement.findUnique({
          where: { memberId_sectionId: { memberId: created.id, sectionId: entitlement.sectionId } },
          select: { renewsAt: true },
        })
        const until = extendedRenewal(held ?? null, months, now)
        await tx.entitlement.upsert({
          where: { memberId_sectionId: { memberId: created.id, sectionId: entitlement.sectionId } },
          create: {
            memberId: created.id,
            sectionId: entitlement.sectionId,
            // The same row carries the item, so a section grant writes one entitlement
            // rather than one per column. Null until the backfill has run, which is the
            // only state in which the item half of this is absent.
            itemId: grant.itemIds[0] ?? null,
            status: 'active',
            startedAt: now,
            renewsAt: until,
            billingProvider: paidOrder?.provider ?? 'cregis',
            stripeSubscriptionId: paidOrder?.stripeSubscriptionId ?? null,
          },
          update: {
            status: 'active',
            renewsAt: until,
            cancelAtPeriodEnd: false,
            // Fills in the item on a row written before the backfill, without ever
            // clearing one that is already set.
            ...(grant.itemIds[0] ? { itemId: grant.itemIds[0] } : {}),
            ...(paidOrder?.stripeSubscriptionId
              ? {
                  billingProvider: paidOrder.provider,
                  stripeSubscriptionId: paidOrder.stripeSubscriptionId,
                }
              : {}),
          },
        })
      }

      /*
       * Everything else the package grants.
       *
       * This is where a bundle becomes real: "Research + RAMP" is a package with two items
       * ticked, and redeeming its code writes an entitlement for each, sharing this one
       * period so they begin and lapse together.
       *
       * Not for a section code — its single item is already on the row above, and running
       * this as well would write the same access twice.
       *
       * ## Every row carries its section
       *
       * A package grant is now the *only* thing a package buyer gets: the subscription
       * columns are no longer written for them, so these rows are their entire access.
       * That makes `sectionId` load-bearing rather than legacy. `hasAnyAccess` counts an
       * entitlement only when it names a section, and `canReadReport` and
       * `reportVisibilityWhere` both resolve a report through one — so an item row with a
       * null section grants nothing anybody can read. Writing it here is what turns "this
       * package includes Dean's energy research" into a report the buyer can open.
       *
       * Found by either key rather than upserted on one: a member who bought a section
       * outright and later buys a package containing it already has a row, reachable by
       * section but not yet by item, and creating a second would violate the unique on
       * (memberId, sectionId). Inside this transaction the read and the write cannot be
       * raced by another redemption.
       */
      if (grant.kind !== 'section') {
        const sectionByItem = new Map(
          (
            await tx.item.findMany({
              where: { id: { in: grant.itemIds } },
              select: { id: true, section: { select: { id: true } } },
            })
          ).map((item) => [item.id, item.section?.id ?? null]),
        )

        for (const itemId of grant.itemIds) {
          const sectionId = sectionByItem.get(itemId) ?? null
          const heldItem = await tx.entitlement.findFirst({
            where: {
              memberId: created.id,
              OR: [{ itemId }, ...(sectionId ? [{ sectionId }] : [])],
            },
            select: { id: true, renewsAt: true },
          })
          const itemUntil = extendedRenewal(heldItem, months, now)

          if (heldItem) {
            await tx.entitlement.update({
              where: { id: heldItem.id },
              data: {
                status: 'active',
                renewsAt: itemUntil,
                cancelAtPeriodEnd: false,
                // Fills in whichever half the existing row is missing. Never clears one:
                // a row found by section keeps its section, and gains the item.
                itemId,
                ...(sectionId ? { sectionId } : {}),
              },
            })
          } else {
            await tx.entitlement.create({
              data: {
                memberId: created.id,
                itemId,
                sectionId,
                status: 'active',
                startedAt: now,
                renewsAt: itemUntil,
                billingProvider: paidOrder?.provider ?? 'cregis',
                stripeSubscriptionId: paidOrder?.stripeSubscriptionId ?? null,
              },
            })
          }
        }
      }

      await tx.redemptionCode.update({
        where: { code },
        data: { redeemedByMemberId: created.id },
      })

      return created
    })

    // After the transaction, and never inside it: neither attribution nor a welcome
    // email may roll back a membership somebody has paid for.
    await recordReferralSignup(referralSlugFromCookie(), email, member.id)

    // Close the funnel on anyone who asked for pricing before buying, so the enquiries
    // queue empties itself rather than needing an operator to tick people off by hand.
    try {
      await db.pricingEnquiry.updateMany({
        where: { email, status: { in: ['new', 'invited'] } },
        data: { status: 'converted', convertedAt: new Date() },
      })
    } catch (error) {
      console.error('[redeem] could not close the pricing enquiry', error)
    }

    // The welcome fires here rather than from the payment webhooks because this is the
    // one point every route converges on — card, crypto, and gifted or referral codes.
    // Sending it from the webhooks would greet buyers and silently skip everybody who
    // arrived on a code.
    try {
      const result = await getNotificationProvider().sendWelcomeEmail(
        { email, firstName: member.firstName },
        `${appBaseUrl()}/dashboard`,
        // Something to read immediately. A member who joins between editions would
        // otherwise wait days for their first email with a report in it, having just
        // paid for research that is already sitting there.
        await latestPublishedReport(),
      )
      if (result.status === 'failed') {
        console.error(`[redeem] welcome email failed for ${email}: ${result.error}`)
      }
    } catch (error) {
      // A membership that is active must not be reported as failed because a welcome
      // could not be sent. The member is in; the greeting is not load-bearing.
      console.error('[redeem] welcome email threw', error)
    }

    await startSession(member)
    return NextResponse.json({ ok: true, redirectTo: safeNext(parsed.data.next) ?? '/dashboard' })
  } catch (error) {
    if (error instanceof RedemptionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[redeem] failed', error)
    return NextResponse.json(
      { error: 'We could not activate your membership. Please contact support.' },
      { status: 500 },
    )
  }
}

class RedemptionError extends Error {}
