/**
 * The facts every legal page states about the company, in one place.
 *
 * Null means "not yet confirmed". Each page renders a null as a visible marker that says
 * what is missing, rather than a plausible-looking guess, so an unfinished document can
 * never be mistaken for a finished one. When the lawyer confirms a value, it is filled in
 * here and every page that names it updates together.
 */
export const LEGAL = {
  /** The contracting entity. Confirmed. */
  entity: 'Northstar International',
  /** The platform and brand. Confirmed. */
  brand: 'NordStar Pro',
  country: null as string | null,
  companyNumber: null as string | null,
  registeredAddress: null as string | null,
  governingLaw: null as string | null,
  supportEmail: null as string | null,
  privacyEmail: null as string | null,
  complaintsEmail: null as string | null,
  /**
   * Whether the platform is authorised by any financial regulator, and by which. This
   * decides the whole Regulatory Status page and has to come from the lawyer.
   */
  regulatoryStatus: null as string | null,
} as const

export type LegalFact = Exclude<keyof typeof LEGAL, 'entity' | 'brand'>

/** What the marker says when a fact is missing. */
export const LEGAL_FACT_LABEL: Record<LegalFact, string> = {
  country: 'country of incorporation',
  companyNumber: 'company number',
  registeredAddress: 'registered address',
  governingLaw: 'governing law and courts',
  supportEmail: 'support email address',
  privacyEmail: 'privacy contact email address',
  complaintsEmail: 'complaints email address',
  regulatoryStatus: 'regulatory status',
}

/**
 * False until a qualified lawyer has reviewed the pack.
 *
 * While false, every legal page carries a draft banner and asks search engines not to
 * index it. Turning it true is the act of publishing, and should follow the review, not
 * precede it.
 */
export const LEGAL_REVIEWED = false

/** The date shown as "last updated" on every page in the pack. */
export const LEGAL_UPDATED = '10 October 2026'

/** The pack, in the order it is listed on /legal and in the footer. */
export const LEGAL_DOCUMENTS = [
  { href: '/terms', title: 'Terms and Conditions', summary: 'The agreement you make when you create an account or subscribe.' },
  { href: '/disclaimer', title: 'Risk Disclaimer', summary: 'What the research is and is not, and the risks of acting on it.' },
  { href: '/privacy-policy', title: 'Privacy Policy', summary: 'What we collect, why, who processes it, and your rights.' },
  { href: '/refund-policy', title: 'Refund and Cancellation Policy', summary: 'Cancelling before renewal, and when money is returned.' },
  { href: '/affiliate-policy', title: 'Affiliate Policy', summary: 'The terms for people who introduce members for commission.' },
  { href: '/regulatory-status', title: 'Regulatory Status', summary: 'How the platform is, and is not, regulated.' },
  { href: '/conflicts-of-interest', title: 'Conflicts of Interest', summary: 'How conflicts between experts, the platform and members are handled.' },
  { href: '/complaints', title: 'Complaints Handling', summary: 'How to complain, and what happens next.' },
] as const

/**
 * The positioning carried throughout the pack, in the owner's words. It appears on the
 * Risk Disclaimer, in the Terms, and in the site footer, because it should be visible in
 * the product and not only in the small print.
 */
export const AGGREGATOR_STATEMENT =
  'NordStar Pro is an aggregator platform of subject matter experts and does not provide any financial advice. All views provided by a Subject Matter Expert are theirs and have nothing associated with NordStar Pro.'
