/**
 * Moving a member off all-access and onto the sections they actually bought.
 *
 * Every member on this site reads everything, because that is what the site granted
 * before packages had contents: a redemption wrote `subscriptionStatus = active`, and
 * `isAllAccess` reads that column and returns true before any entitlement is consulted.
 * The per-section model is live, priced and on sale, and not one existing member is
 * subject to it.
 *
 * This plans the move for one member. It is deliberately a *plan* rather than a write:
 * the thing being changed is somebody's paid-for access, and the failure mode — cutting
 * off a member who has paid — is worse than the state being fixed. So the caller shows
 * the plan first, and every case where the right answer is unknown refuses instead of
 * guessing.
 *
 * Pure and dependency-free, so the refusals can be tested exhaustively without a
 * database. The writes live in the route.
 */

export type ConversionRefusal =
  | 'not-all-access'
  | 'no-package'
  | 'empty-package'

export type ConversionPlan =
  | { ok: false; reason: ConversionRefusal; message: string }
  | {
      ok: true
      /** The sections this member keeps, taken from what they bought. */
      sections: { id: string; name: string }[]
      /**
       * When the new entitlements lapse — the member's own renewal date, carried across
       * unchanged. Null for a comp, which stays open-ended.
       */
      renewsAt: Date | null
    }

export type ConversionInput = {
  member: {
    allAccess: boolean
    subscriptionRenewsAt: Date | null
    /** The package they bought, recorded at redemption. */
    packageId: string | null
  }
  /** The bought package's live contents, already resolved to sections. */
  packageSections: { id: string; name: string }[]
  /** Whether the member's package exists and is readable at all. */
  packageFound: boolean
}

/**
 * What would happen if this member were moved to section access.
 *
 * Three refusals, and each one is a case where converting would destroy information
 * rather than correct it:
 *
 * **not-all-access** — there is nothing to convert. Their access is already per section.
 *
 * **no-package** — the member carries no `packageId`, so what they bought is not
 * recorded. Every candidate answer is a guess: granting nothing cuts off somebody who
 * paid, and granting everything is the state being fixed. The operator has to decide, and
 * the per-section grant control on the same screen is how.
 *
 * **empty-package** — the package exists and has no contents ticked onto it. This is the
 * common one and it is not a fault in the member: converting would leave them holding
 * nothing, because there is nothing to hold. The remedy is upstream — tick the sections
 * onto that package — and then this member converts cleanly along with everyone else who
 * bought it.
 */
export function planConversion(input: ConversionInput): ConversionPlan {
  if (!input.member.allAccess) {
    return {
      ok: false,
      reason: 'not-all-access',
      message: 'This member is already on section access. There is nothing to convert.',
    }
  }

  if (!input.member.packageId || !input.packageFound) {
    return {
      ok: false,
      reason: 'no-package',
      message:
        'No package is recorded against this member, so there is no record of what they ' +
        'bought. Converting would be a guess. Grant the sections they should have by hand ' +
        'below, then set the subscription to expired.',
    }
  }

  if (input.packageSections.length === 0) {
    return {
      ok: false,
      reason: 'empty-package',
      message:
        'Their package has no sections ticked onto it, so converting would leave them ' +
        'with nothing to read. Add the sections to that package first — every member who ' +
        'bought it can then be converted.',
    }
  }

  return {
    ok: true,
    sections: input.packageSections,
    /*
     * Their own date, carried across unchanged.
     *
     * Not a fresh period: this is a correction to how access is recorded, not a renewal,
     * and a member who has paid to February must still reach February afterwards. Null
     * stays null — an open-ended comp converts to open-ended entitlements rather than
     * quietly acquiring an expiry nobody granted.
     */
    renewsAt: input.member.subscriptionRenewsAt,
  }
}
