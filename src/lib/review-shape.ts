/**
 * The rules for section reviews that need no database: what a review may hold, what reads
 * like a claim about returns, and how ratings are summarised.
 */

export const REVIEW_BODY_MAX = 1500

/** A whole number of stars from 1 to 5, or null for anything else. */
export function parseRating(input: unknown): number | null {
  const value = Number(input)
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null
}

/**
 * Why a review needs a harder look, or null.
 *
 * A review of financial research that says "made me 40% last quarter" is a performance
 * claim the platform would be publishing. This does not decide anything — every review is
 * read before it is shown — it puts the risky ones first and says why. It errs towards
 * flagging: a false alarm costs an admin a second glance; a miss costs a published claim.
 */
export function performanceClaim(body: string | null | undefined): string | null {
  const text = (body ?? '').toLowerCase()
  if (!text.trim()) return null
  const checks: [RegExp, string][] = [
    [/\b\d+(\.\d+)?\s*(%|percent|per cent)/, 'quotes a percentage'],
    [/[$€£¥₹]\s?\d|\b\d[\d,.]*\s?(usd|dollars|aed|eur|gbp|inr|k\b)/, 'quotes an amount of money'],
    [/\b\d+(\.\d+)?\s*x\b|\b(doubled|tripled|10x|100x)\b/, 'claims a multiple'],
    [/\b\d+\s*pips?\b/, 'quotes pips'],
    [/\b(profit|profits|profitable|returns?|roi|gains?|made me|earned me|guaranteed|risk[- ]free|never lose|win rate)\b/, 'talks about returns or profit'],
  ]
  const reasons = checks.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason)
  return reasons.length ? `Possible performance claim: ${reasons.join(', ')}` : null
}

export type RatingSummary = { average: number; count: number }

/** The average to one decimal and how many it is of; null when there is nothing to average. */
export function summariseRatings(ratings: number[]): RatingSummary | null {
  const valid = ratings.filter((rating) => parseRating(rating) !== null)
  if (valid.length === 0) return null
  const average = Math.round((valid.reduce((sum, rating) => sum + rating, 0) / valid.length) * 10) / 10
  return { average, count: valid.length }
}

/** "4.6 ★ (12 reviews)" style label parts. */
export function reviewCountLabel(count: number): string {
  return `${count} review${count === 1 ? '' : 's'}`
}
