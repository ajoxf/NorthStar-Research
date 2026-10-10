/**
 * What a Stripe subscription pays for, decided from the facts we hold about it.
 *
 * Pure, so it is tested directly (subscription-target-shape.test.ts). The webhook reads the
 * facts from the database (subscription-target.ts) and acts on the answer.
 *
 * **Why this exists.** The renewal and cancellation handlers used to fall back to the
 * member's all-access columns whenever no entitlement carried the subscription id. Package
 * redemptions never stored that id, and a signed-in member adding a section by code did
 * not either, so the second invoice of a section or a package switched on the whole
 * archive — and cancelling one section could cancel somebody's full membership. The
 * fallback is now reached only when the subscription is positively known to be the
 * all-access membership; anything unrecognised changes nothing and is logged.
 */
export type SubscriptionFacts = {
  /** Entitlements already carrying this subscription id. */
  linkedEntitlementIds: string[]
  /** The order that started this subscription, if we can find it. */
  order: { sectionId: string | null; packageId: string | null; packageItemIds: string[] } | null
  /** The member's own subscription id, which is how the legacy all-access plan is recorded. */
  memberSubscriptionId: string | null
  subscriptionId: string
}

export type SubscriptionTarget =
  /** Rows already linked. Act on exactly these. */
  | { kind: 'entitlements'; ids: string[] }
  /** A section purchase whose row was never linked: find it by section, then link it. */
  | { kind: 'section'; sectionId: string }
  /** A package purchase whose rows were never linked: find them by item, then link them. */
  | { kind: 'items'; itemIds: string[] }
  /** The legacy all-access membership, held on the member's own columns. */
  | { kind: 'all_access' }
  /** Nothing we can tie it to. Change nothing. */
  | { kind: 'unknown' }

export function subscriptionTarget(facts: SubscriptionFacts): SubscriptionTarget {
  if (facts.linkedEntitlementIds.length > 0) {
    return { kind: 'entitlements', ids: facts.linkedEntitlementIds }
  }

  const { order } = facts
  if (order) {
    if (order.sectionId) return { kind: 'section', sectionId: order.sectionId }
    if (order.packageId && order.packageItemIds.length > 0) {
      return { kind: 'items', itemIds: order.packageItemIds }
    }
    // The built-in plan, or a package nobody has put anything in: both grant all-access,
    // the same rule `grantFor` applies at redemption.
    return { kind: 'all_access' }
  }

  // No order on record. Only the member's own subscription id says this is their membership.
  return facts.memberSubscriptionId === facts.subscriptionId ? { kind: 'all_access' } : { kind: 'unknown' }
}
