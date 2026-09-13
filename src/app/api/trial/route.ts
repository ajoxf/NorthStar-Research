import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentMember, hashPassword, startSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  refusalMessage,
  researchTrialRefusal,
  researchTrialRefusalMessage,
  trialEndsAt,
  trialOfferFor,
  trialOffers,
  trialRefusal,
} from '@/lib/trial'

/**
 * Start a free trial.
 *
 * Two ways in, one outcome:
 *
 *   - **Signed out**, with an email and a password: an account is created and the trial
 *     granted. This is the distribution path — no code to ask for, nothing to wait on.
 *   - **Signed in**, with no body at all: the trial is granted to whoever is signed in.
 *     Without this an existing member who never bought this product would have nowhere to
 *     go: their email already has an account, so the first path refuses them.
 *
 * What it writes is one Entitlement row. Not the subscription columns on Member — those
 * are the legacy all-access membership, and a trial of a piece of software is not a free
 * month of the research archive. See the note at the top of lib/trial.ts.
 */

const Body = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  /** Which product. Optional only so a single-offer site keeps working without it. */
  itemSlug: z.string().trim().min(1).optional(),
})

/**
 * `signIn` is a path the form can offer as a link.
 *
 * A refusal that names the next step without providing it is a dead end: "sign in and
 * start your trial from there" left somebody on a signup page with no way to sign in and
 * no idea where "there" was. It carries no information the caller does not already have —
 * /login is on the site's own header.
 */
const fail = (error: string, status = 400, signIn?: string) =>
  NextResponse.json(signIn ? { error, signIn } : { error }, { status })

export async function POST(request: Request) {
  /*
   * Read the body once, up front.
   *
   * It now decides WHICH product is being trialled, and several can be open at once, so
   * the item lookup below depends on it — where before there was one offer and the body
   * only mattered for a signed-out signup.
   */
  const rawBody = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const askedSlug = typeof rawBody?.itemSlug === 'string' ? rawBody.itemSlug.trim() : ''

  /*
   * No slug means "the trial", which is unambiguous only while exactly one is open. With
   * several open, guessing would grant somebody a trial of something they did not ask for,
   * so it is refused and the form is told to name one.
   */
  let offer = askedSlug ? await trialOfferFor(askedSlug) : null
  if (!offer && !askedSlug) {
    const open = await trialOffers()
    if (open.length === 1) offer = open[0]
    else if (open.length > 1) return fail('Choose which trial you would like.', 400)
  }
  if (!offer) return fail(refusalMessage('disabled'), 403)

  /*
   * The research membership is granted differently, so it forks here.
   *
   * Everything below writes an Entitlement row pointing at an Item. The research
   * membership is not an item — it is two columns on Member — so there is nothing for one
   * to point at, and the two paths share the signup but not the grant.
   */
  if (offer.isResearch) return grantResearchTrial(offer.days, rawBody)

  /*
   * Read before anything is written, so a refusal cannot leave half an account behind.
   *
   * The section is loaded alongside, because a trial of a research section has to write
   * `sectionId` as well as `itemId`. Report access is matched on the section — that is
   * what stops a single-section buyer reading the whole back catalogue — so an
   * item-only entitlement would let somebody through the door into an empty archive.
   *
   * A section carries its own `archivedAt`, separate from the item's. Either one being
   * set means the offer is off the shelf.
   */
  const item = await db.item.findUnique({
    where: { slug: offer.slug },
    select: {
      id: true,
      name: true,
      kind: true,
      archivedAt: true,
      section: { select: { id: true, archivedAt: true } },
    },
  })
  const sectionId = item?.section?.id ?? null
  const itemExists = Boolean(
    item &&
      !item.archivedAt &&
      // A section item with no section row is a half-finished backfill, not an offer.
      (item.kind !== 'section' || (item.section && !item.section.archivedAt)),
  )

  const signedIn = await getCurrentMember()

  /*
   * Has this account ever held this item?
   *
   * Ever, not currently: an expired trial still counts, or the trial renews itself every
   * month for anyone willing to wait. Checked before the account is created for a signed
   * out request, by email, so signing up again with the same address is refused too.
   */
  const existing = signedIn ?? null
  let heldEver = false
  if (existing && item) {
    /*
     * Either half counts. An entitlement written before items existed carries only a
     * section, so asking about the item alone would offer a free trial of a section
     * somebody already subscribes to — and then fail on the unique key, reported as a
     * refusal nobody can act on.
     */
    heldEver =
      (await db.entitlement.count({
        where: {
          memberId: existing.id,
          OR: [{ itemId: item.id }, ...(sectionId ? [{ sectionId }] : [])],
        },
      })) > 0
  }

  // Signed out: everything hangs off the email, so parse the body first.
  let email = existing?.email ?? ''
  let parsed: z.infer<typeof Body> | null = null

  if (!existing) {
    // rawBody, not a second request.json(): a request body can only be read once, and
    // reading it again here returns nothing, failing every signed-out signup on the site.
    const result = Body.safeParse(rawBody)
    if (!result.success) {
      return fail(result.error.issues[0]?.message ?? 'Check the form and try again.')
    }
    parsed = result.data
    email = parsed.email.trim().toLowerCase()

    const already = await db.member.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    })
    if (already) {
      // Never silently overwrite a password, and never reveal more than the person asking
      // already knows: whoever holds this address can find out by signing in.
      /*
       * Straight to the dashboard, which is where the offer lives for somebody who
       * already has an account — a research member who has never held this product sees
       * the same trial offered there, one click, no form to fill in twice.
       */
      return fail(
        'That email already has an account. Sign in and the trial is waiting on your dashboard.',
        409,
        '/login?next=/dashboard',
      )
    }
  }

  const refusal = trialRefusal({ enabled: true, itemExists, heldEver })
  if (refusal) return fail(refusalMessage(refusal), refusal === 'already_trialled' ? 409 : 403)
  if (!item) return fail(refusalMessage('no_item'), 403)

  const now = new Date()
  const endsAt = trialEndsAt(offer.days, now)

  const member = existing
    ? existing
    : await db.member.create({
        data: {
          email,
          passwordHash: await hashPassword(parsed!.password),
          firstName: parsed!.firstName || null,
          lastName: parsed!.lastName || null,
          role: 'member',
          // Deliberately absent: subscriptionStatus, subscriptionRenewsAt, packageId.
          // A trialist is not a member of the research desk.
          source: 'trial',
        },
      })

  /*
   * The trial itself.
   *
   * `create`, not an upsert: the eligibility check above has already established that this
   * member holds no entitlement to this item, and the unique key on (memberId, itemId)
   * makes a race lose loudly rather than quietly extending somebody's access.
   */
  try {
    await db.entitlement.create({
      data: {
        memberId: member.id,
        itemId: item.id,
        // Set for a section, null for a product. The one field that decides whether this
        // entitlement can read anything.
        sectionId,
        status: 'active',
        startedAt: now,
        renewsAt: endsAt,
      },
    })
  } catch {
    return fail(refusalMessage('already_trialled'), 409)
  }

  if (!existing) await startSession(member)

  return NextResponse.json({
    ok: true,
    item: item.name,
    days: offer.days,
    endsAt: endsAt.toISOString(),
  })
}

/**
 * A free trial of the research membership itself.
 *
 * Writes `subscriptionStatus: 'trialing'` and an end date on Member, which every access
 * check already reads — so a trialist reads exactly what a member reads, including the
 * back archive, and stops reading the moment the date passes whether or not the nightly
 * job has run.
 *
 * `trialing` rather than `active` matters more than it looks. A trialist has paid nothing.
 * Recording them as active would make a trial indistinguishable from a sale in the members
 * list and in every count taken from it, which is the sort of thing that is only noticed
 * when the figures are checked against what actually arrived in the bank.
 */
async function grantResearchTrial(days: number, rawBody: Record<string, unknown> | null) {
  const signedIn = await getCurrentMember()
  const now = new Date()
  const endsAt = trialEndsAt(days, now)

  if (signedIn) {
    const refusal = researchTrialRefusal({
      enabled: true,
      subscriptionStatus: signedIn.subscriptionStatus,
      researchTrialStartedAt: signedIn.researchTrialStartedAt,
    })
    if (refusal) {
      return fail(researchTrialRefusalMessage(refusal), refusal === 'disabled' ? 403 : 409)
    }

    /*
     * Conditional on the marker still being null.
     *
     * Two requests arriving together would both pass the check above and the second would
     * extend the first's trial by another fortnight. `updateMany` with the condition in
     * the WHERE makes exactly one of them match; the loser changes nothing and is told it
     * has already had one, which is true.
     */
    const claimed = await db.member.updateMany({
      where: { id: signedIn.id, researchTrialStartedAt: null, subscriptionStatus: 'pending' },
      data: {
        subscriptionStatus: 'trialing',
        subscriptionStartedAt: now,
        subscriptionRenewsAt: endsAt,
        researchTrialStartedAt: now,
      },
    })
    if (claimed.count === 0) return fail(researchTrialRefusalMessage('already_trialled'), 409)

    return NextResponse.json({ ok: true, days, endsAt: endsAt.toISOString() })
  }

  // Signed out: an account is created, exactly as the item path does.
  const result = Body.safeParse(rawBody)
  if (!result.success) {
    return fail(result.error.issues[0]?.message ?? 'Check the form and try again.')
  }
  const email = result.data.email.trim().toLowerCase()

  const already = await db.member.findUnique({ where: { email }, select: { id: true } })
  if (already) {
    // Never overwrite a password, and never say more than whoever holds the address can
    // already find out by signing in.
    return fail(
      'That email already has an account. Sign in and the trial is waiting on your dashboard.',
      409,
      '/login?next=/dashboard',
    )
  }

  const member = await db.member.create({
    data: {
      email,
      passwordHash: await hashPassword(result.data.password),
      firstName: result.data.firstName || null,
      lastName: result.data.lastName || null,
      role: 'member',
      subscriptionStatus: 'trialing',
      subscriptionStartedAt: now,
      subscriptionRenewsAt: endsAt,
      researchTrialStartedAt: now,
      // Paid nothing. Counting a trialist as a crypto customer would overstate every
      // conversion figure the members list is read for.
      source: 'trial',
    },
  })

  /*
   * Signed in immediately.
   *
   * They have just chosen a password and been granted access; sending them to a login
   * form to type it again is a step that exists only because the code was written in that
   * order. The item path does the same thing.
   */
  await startSession(member)

  return NextResponse.json({ ok: true, days, endsAt: endsAt.toISOString() })
}
