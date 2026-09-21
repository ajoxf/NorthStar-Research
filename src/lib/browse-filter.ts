/**
 * Narrowing a list of things on sale, by the four questions a visitor actually arrives
 * with: which subject, whose work, what it costs, and can I read it today.
 *
 * Pure and dependency-free on purpose. The same rules run on three surfaces — the
 * homepage's featured band, /coverage and /experts — and three copies of "does this row
 * match" is three places for them to disagree about what an empty filter means. The UI
 * that collects the choices lives in `components/filter-bar.tsx`; only the deciding is
 * here, which is also what makes it testable without a browser or a database.
 *
 * No `server-only` guard: this is imported by client components and by `node --test`.
 */

/** A sort the visitor can ask for. Null is the page's own order, which is curated. */
export type BrowseSort = 'price-asc' | 'price-desc' | null

export type BrowseFilterState = {
  /** Topic names to keep. Empty means every subject — see `matchesBrowseFilter`. */
  subjects: string[]
  /** Author slugs to keep. Empty means everybody. */
  authors: string[]
  /** Keep only rows at or under this, in minor units. Null means no ceiling. */
  maxPriceCents: number | null
  /** Keep only rows a visitor can start reading today without paying. */
  trialOnly: boolean
  sort: BrowseSort
}

export const EMPTY_BROWSE_FILTER: BrowseFilterState = {
  subjects: [],
  authors: [],
  maxPriceCents: null,
  trialOnly: false,
  sort: null,
}

/**
 * The shape every surface reduces its own rows to before filtering.
 *
 * Plural `subjects` and `authors` because a row is not always one of each: a topic card on
 * the homepage covers every expert writing that subject, and an expert card covers every
 * subject that person writes. Singular fields would have forced those two surfaces to
 * filter differently from /coverage, which is the duplication this module exists to avoid.
 */
export type BrowseItem = {
  /** Stable identity, so a caller can map results back to its own richer object. */
  id: string
  subjects: string[]
  /** Author slugs, not names: two experts may share a name, and slugs are already unique. */
  authors: string[]
  /** The cheapest way into this row, in minor units. Null when nothing here is on sale. */
  priceCents: number | null
  hasTrial: boolean
}

/**
 * Does one row survive the filter?
 *
 * **An empty list means "no preference", not "match nothing".** That is the only sane
 * reading for a filter bar nobody has touched yet — the other one renders an empty page
 * on arrival and looks broken — and it is why each clause is guarded by a length check
 * rather than folded into a single `every`.
 *
 * Within one dimension the choices are OR (Crude Oil *or* FX), and across dimensions they
 * are AND (Crude Oil, *and* by Dean, *and* under $100). That is what every filter UI does,
 * and matching the convention matters more here than any argument for the alternative.
 */
export function matchesBrowseFilter(item: BrowseItem, filter: BrowseFilterState): boolean {
  if (filter.subjects.length > 0 && !item.subjects.some((s) => filter.subjects.includes(s))) {
    return false
  }
  if (filter.authors.length > 0 && !item.authors.some((a) => filter.authors.includes(a))) {
    return false
  }
  if (filter.trialOnly && !item.hasTrial) return false
  if (filter.maxPriceCents !== null) {
    /*
     * A row with no price cannot satisfy a ceiling.
     *
     * `priceCents` is null for a contributor who is announced but has nothing on sale.
     * Treating that as free would surface exactly the rows a visitor shopping to a budget
     * cannot buy, which is the opposite of what the filter was asked for.
     */
    if (item.priceCents === null) return false
    if (item.priceCents > filter.maxPriceCents) return false
  }
  return true
}

/**
 * Filter and sort in one pass, returning ids in the order they should render.
 *
 * Ids rather than the items themselves so a caller can keep its own richer row — a topic
 * card, an expert card — without this module needing to know what a card is.
 *
 * A row with no price sorts last whichever direction is asked for. It has no figure to
 * compare, and putting "price unknown" at the top of a cheapest-first list would answer a
 * question the visitor did not ask.
 */
export function browseOrder(items: BrowseItem[], filter: BrowseFilterState): string[] {
  const kept = items.filter((item) => matchesBrowseFilter(item, filter))
  if (filter.sort === null) return kept.map((item) => item.id)

  const direction = filter.sort === 'price-asc' ? 1 : -1
  return [...kept]
    .sort((a, b) => {
      if (a.priceCents === null && b.priceCents === null) return 0
      if (a.priceCents === null) return 1
      if (b.priceCents === null) return -1
      return (a.priceCents - b.priceCents) * direction
    })
    .map((item) => item.id)
}

/**
 * The price ceilings offered, derived from what is actually on sale rather than fixed.
 *
 * Hard-coded bands ("under $50, under $100") are wrong the moment somebody prices a
 * package at $349: every band matches everything, and the control does nothing while
 * appearing to work. These are round numbers spanning the real range, and a range too
 * narrow to divide gets no ceilings at all rather than one that keeps every row.
 */
export function priceCeilings(items: BrowseItem[]): number[] {
  const prices = items
    .map((item) => item.priceCents)
    .filter((price): price is number => price !== null)
  if (prices.length < 2) return []

  const low = Math.min(...prices)
  const high = Math.max(...prices)
  if (low === high) return []

  // Round dollars, ascending, each one keeping at least one row and excluding at least one.
  const steps = [50, 100, 150, 200, 300, 500].map((dollars) => dollars * 100)
  return steps.filter((ceiling) => ceiling >= low && ceiling < high)
}

/** Is anything actually being narrowed? Drives the "Clear" control and the result count. */
export function browseFilterActive(filter: BrowseFilterState): boolean {
  return (
    filter.subjects.length > 0 ||
    filter.authors.length > 0 ||
    filter.maxPriceCents !== null ||
    filter.trialOnly
  )
}

/** Add or remove one value from a multi-select dimension. */
export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}
