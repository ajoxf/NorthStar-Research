/**
 * Which way a withdrawal is allowed to move.
 *
 * Pure and tested, and kept out of the route, because this is the control that stops money
 * leaving on one action. The screen only ever offers the legal buttons — but the screen is
 * not what an API client talks to, so the route asks this too, and both get the same answer
 * from the same table.
 *
 * ## The rule worth stating
 *
 * **`requested` cannot reach `sent`.** Approval is not a formality on the way out; it is a
 * separate act, by a named person, recorded with a time. Allowing the jump would mean a
 * single request could move money, which is exactly what "every withdrawal needs one
 * approval check before it is processed" exists to prevent.
 *
 * No `server-only` guard: imported by client components and by `node --test`.
 */

export type PayoutStatusValue =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'settled'
  | 'failed'

/**
 * Where each state may go next.
 *
 * `rejected` and `settled` are terminal. A rejected payout is reopened by requesting a new
 * one rather than by reviving this row, so the record of what was turned down survives; a
 * settled one has arrived and there is nowhere left to go.
 *
 * `failed` goes back to `approved` rather than to `sent`, so a retry is a deliberate act
 * on something a person has already looked at, not a loop a stuck job can spin in.
 */
const ALLOWED: Record<PayoutStatusValue, PayoutStatusValue[]> = {
  requested: ['approved', 'rejected'],
  approved: ['sent', 'rejected'],
  sent: ['settled', 'failed'],
  rejected: [],
  settled: [],
  failed: ['approved'],
}

export function nextStatuses(from: PayoutStatusValue): PayoutStatusValue[] {
  return ALLOWED[from] ?? []
}

export function canTransition(from: PayoutStatusValue, to: PayoutStatusValue): boolean {
  return nextStatuses(from).includes(to)
}

/** Terminal states, where nothing further happens. */
export function isFinal(status: PayoutStatusValue): boolean {
  return nextStatuses(status).length === 0
}

/**
 * Has this payout left the building?
 *
 * The question the ledger asks. A payout debits the balance when it is *sent*, not when it
 * is approved: an approved payout that is never sent would otherwise hold money out of a
 * contributor's balance indefinitely, and a rejected one would have to be credited back.
 */
export function reducesBalance(status: PayoutStatusValue): boolean {
  return status === 'sent' || status === 'settled'
}

/**
 * Plain words for each state, used on the screen and in any message about one.
 *
 * Here rather than in the component so the admin list, a statement and an email cannot
 * describe the same payout three different ways.
 */
export const PAYOUT_LABELS: Record<PayoutStatusValue, string> = {
  requested: 'Awaiting approval',
  approved: 'Approved, not yet sent',
  rejected: 'Rejected',
  sent: 'Sent',
  settled: 'Settled',
  failed: 'Failed',
}

/**
 * Was this approved by the same person who asked for it?
 *
 * Allowed, because a one-person desk would otherwise be unable to pay anybody at all — but
 * never silent. Wherever a payout is shown, a self-approved one says so, so the difference
 * between "two people saw this" and "one person did both" is visible rather than buried in
 * two id columns nobody compares.
 */
export function selfApproved(payout: {
  requestedByMemberId: string | null
  approvedByMemberId: string | null
}): boolean {
  return (
    payout.approvedByMemberId !== null &&
    payout.requestedByMemberId !== null &&
    payout.approvedByMemberId === payout.requestedByMemberId
  )
}
