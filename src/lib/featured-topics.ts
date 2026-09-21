/**
 * Which subjects the homepage's featured band shows.
 *
 * **Nothing ticked means show them all.** The band began as every topic with something on
 * sale, which reads well at three subjects and badly at fifteen, so an operator can now
 * choose. But a curation flag that starts empty has to decide what empty means, and the
 * two readings are not symmetrical: "show none" empties the band on the deploy that adds
 * the column, on a live site, with nobody having asked for that. "Show all" is exactly the
 * behaviour the site has today, and the first tick is what changes it.
 *
 * Pure so the rule can be tested without a database, and so the page and the admin's
 * preview cannot disagree about it.
 */
export function featuredTopics<T extends { featured: boolean }>(topics: T[]): T[] {
  const chosen = topics.filter((topic) => topic.featured)
  return chosen.length > 0 ? chosen : topics
}

/** Is the band curated, or still showing everything by default? Drives the admin's hint. */
export function featuredIsCurated(topics: { featured: boolean }[]): boolean {
  return topics.some((topic) => topic.featured)
}
