import 'server-only'

import { db } from '@/lib/db'
import { withdrawable } from '@/lib/earnings'
import { balanceFor, balanceForAffiliate } from '@/lib/ledger'
import { canTransition, type PayoutStatusValue } from '@/lib/payout-flow'

/**
 * Moving a withdrawal through its states, and the ledger entries that follow.
 *
 * The legal moves live in payout-flow.ts, which is pure and tested. This performs them and
 * writes what each one means for the balance.
 *
 * **Every transition is checked here, not only on the screen.** The admin UI offers the
 * buttons that make sense, but an API client is not a screen, and the control that stops
 * money leaving on one action has to sit where the write happens.
 */

export type PayoutResult = { ok: true } | { ok: false; error: string; status?: number }

/**
 * Ask for a withdrawal.
 *
 * Checked against the *available* balance rather than the total, which is the whole point
 * of the holdback: money inside it may yet be refunded, and paying it out turns a clawback
 * into a debt to chase rather than an entry to write.
 */
export async function requestPayout(
  input: ({ authorId: string; affiliateId?: never } | { affiliateId: string; authorId?: never }) & {
    amountCents: number
    destination?: string | null
    note?: string | null
    requestedByMemberId: string
  },
): Promise<PayoutResult & { payoutId?: string }> {
  // One balance, one queue: an expert's earnings or an affiliate's commission.
  let party: { authorId: string } | { affiliateId: string }
  let balance
  if (input.authorId) {
    const author = await db.author.findUnique({ where: { id: input.authorId }, select: { id: true } })
    if (!author) return { ok: false, error: 'No such contributor.', status: 404 }
    party = { authorId: input.authorId }
    balance = await balanceFor(input.authorId)
  } else {
    const affiliateId = input.affiliateId as string
    const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId }, select: { id: true } })
    if (!affiliate) return { ok: false, error: 'No such affiliate.', status: 404 }
    party = { affiliateId }
    balance = await balanceForAffiliate(affiliateId)
  }

  /*
   * Money already requested but not yet resolved is not available again.
   *
   * Without this, two requests of the full balance could both be approved and both paid —
   * the balance only moves when a payout is *sent*, so nothing else would notice until the
   * contributor had been paid twice.
   */
  const pending = await db.payout.aggregate({
    where: { ...party, status: { in: ['requested', 'approved'] } },
    _sum: { amountCents: true },
  })
  const spokenFor = pending._sum.amountCents ?? 0
  const free = balance.availableCents - spokenFor

  const check = withdrawable({ ...balance, availableCents: free }, input.amountCents)
  if (!check.ok) {
    return {
      ok: false,
      error:
        spokenFor > 0
          ? `${check.reason} ${(spokenFor / 100).toFixed(2)} is already on a withdrawal awaiting approval or sending.`
          : check.reason,
      status: 409,
    }
  }

  const payout = await db.payout.create({
    data: {
      ...party,
      amountCents: input.amountCents,
      destination: input.destination ?? null,
      note: input.note ?? null,
      requestedByMemberId: input.requestedByMemberId,
      status: 'requested',
    },
    select: { id: true },
  })
  return { ok: true, payoutId: payout.id }
}

/**
 * Move a payout to its next state.
 *
 * The ledger is written here rather than by whoever calls this, and only on the transition
 * that actually moves money:
 *
 * - **sent** debits the balance. Not `approved`: an approved payout that is never sent
 *   would hold money out of a contributor's balance indefinitely, and a rejected one would
 *   need crediting back — a second entry for a thing that never happened.
 * - **failed, after sending** credits it back, as a new row rather than by deleting the
 *   debit. The ledger only ever gains rows; a payout that went out and bounced is two
 *   facts, and both belong on the record.
 */
export async function advancePayout(input: {
  payoutId: string
  to: PayoutStatusValue
  byMemberId: string
  reason?: string | null
  externalReference?: string | null
}): Promise<PayoutResult> {
  const payout = await db.payout.findUnique({
    where: { id: input.payoutId },
    select: {
      id: true,
      authorId: true,
      affiliateId: true,
      amountCents: true,
      currency: true,
      status: true,
      requestedByMemberId: true,
    },
  })
  if (!payout) return { ok: false, error: 'No such withdrawal.', status: 404 }

  const from = payout.status as PayoutStatusValue
  if (!canTransition(from, input.to)) {
    return {
      ok: false,
      error:
        from === 'requested' && input.to === 'sent'
          ? 'A withdrawal has to be approved before it can be sent.'
          : `A withdrawal cannot go from ${from} to ${input.to}.`,
      status: 409,
    }
  }

  if (input.to === 'rejected' && !input.reason?.trim()) {
    // A rejection with no reason is one the contributor cannot act on, and one nobody can
    // explain six months later.
    return { ok: false, error: 'Say why it is being rejected.', status: 400 }
  }

  await db.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payout.id },
      data: {
        status: input.to,
        ...(input.to === 'approved'
          ? { approvedByMemberId: input.byMemberId, approvedAt: new Date(), rejectedReason: null }
          : {}),
        ...(input.to === 'rejected' ? { rejectedReason: input.reason ?? null } : {}),
        ...(input.to === 'sent'
          ? { sentAt: new Date(), externalReference: input.externalReference ?? null }
          : {}),
        ...(input.to === 'settled' ? { settledAt: new Date() } : {}),
      },
    })

    if (input.to === 'sent') {
      await tx.ledgerEntry.create({
        data: {
          authorId: payout.authorId,
          affiliateId: payout.affiliateId,
          kind: 'payout',
          // Negative: the ledger is signed, and a payout takes money off the balance.
          amountCents: -payout.amountCents,
          currency: payout.currency,
          // No holdback on money that has already left.
          payableAt: null,
          payoutId: payout.id,
          createdByMemberId: input.byMemberId,
          note: input.externalReference ? `Sent — ${input.externalReference}` : 'Sent',
        },
      })
    }

    if (input.to === 'failed' && from === 'sent') {
      await tx.ledgerEntry.create({
        data: {
          authorId: payout.authorId,
          affiliateId: payout.affiliateId,
          kind: 'adjustment',
          amountCents: payout.amountCents,
          currency: payout.currency,
          payableAt: null,
          payoutId: payout.id,
          createdByMemberId: input.byMemberId,
          note: input.reason ? `Withdrawal failed — ${input.reason}` : 'Withdrawal failed, balance restored',
        },
      })
    }
  })

  return { ok: true }
}

/**
 * A correction, in either direction, typed by an operator.
 *
 * Exists because the alternative is editing a row, and an append-only ledger whose rows can
 * be edited is just a table. Every real ledger needs a way to say "this was wrong" without
 * destroying what it said before.
 */
export async function postAdjustment(input: {
  authorId: string
  amountCents: number
  note: string
  byMemberId: string
}): Promise<PayoutResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    return { ok: false, error: 'Enter an amount, positive or negative.', status: 400 }
  }
  if (!input.note.trim()) {
    // An unexplained adjustment is indistinguishable from a mistake, and this is the one
    // entry kind with no document behind it.
    return { ok: false, error: 'Say what this adjustment is for.', status: 400 }
  }

  const author = await db.author.findUnique({ where: { id: input.authorId }, select: { id: true } })
  if (!author) return { ok: false, error: 'No such contributor.', status: 404 }

  await db.ledgerEntry.create({
    data: {
      authorId: input.authorId,
      kind: 'adjustment',
      amountCents: input.amountCents,
      payableAt: null,
      note: input.note.trim(),
      createdByMemberId: input.byMemberId,
    },
  })
  return { ok: true }
}
