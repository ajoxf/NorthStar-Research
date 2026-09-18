import type { Member } from '@prisma/client'

import { memberReportWhere } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * The experts whose work this member may actually read.
 *
 * Built from the same `memberReportWhere` fragment every report query uses, rather than
 * from a second rule of its own. That matters more than it looks: a card that offers a
 * name the member cannot open is a promise the report gate then breaks, and two rules
 * that have to agree about who may read what will eventually disagree.
 *
 * So the set is derived from the reports themselves — an expert appears because something
 * of theirs is readable, not because a subscription row was interpreted a second way.
 *
 * An all-access member sees every expert with a published report. A member holding one
 * section sees exactly that section's author. Somebody holding nothing gets an empty
 * list, and the caller decides what to say about it.
 */
export type MemberExpert = {
  id: string
  slug: string
  name: string
  headline: string | null
  photoUrl: string | null
  /** Published reports of theirs that this member can open. Never a total they cannot see. */
  reportCount: number
  /** The subjects of theirs the member holds, for the card's label. */
  topics: string[]
  /** The most recent edition they can read, for "last published". */
  latestAt: Date | null
}

export async function memberExperts(
  member: Pick<Member, 'id' | 'role' | 'subscriptionStatus' | 'subscriptionRenewsAt'>,
): Promise<MemberExpert[]> {
  const visible = await memberReportWhere(member)

  /*
   * Grouped in the database rather than pulled and counted here. An archive of a few
   * thousand reports is a realistic size for this product in a year or two, and loading
   * all of them to count them by author would be a page that gets slower every week.
   */
  const rows = await db.report.groupBy({
    by: ['sectionId'],
    where: { published: true, sectionId: { not: null }, ...visible },
    _count: { _all: true },
    _max: { publishDate: true },
  })

  const sectionIds = rows
    .map((row) => row.sectionId)
    .filter((id): id is string => id !== null)
  if (sectionIds.length === 0) return []

  const sections = await db.section.findMany({
    where: { id: { in: sectionIds } },
    select: {
      id: true,
      topic: { select: { name: true } },
      author: {
        select: { id: true, slug: true, name: true, headline: true, photoUrl: true, sortOrder: true },
      },
    },
  })

  const byAuthor = new Map<string, MemberExpert & { sortOrder: number }>()

  for (const section of sections) {
    const row = rows.find((entry) => entry.sectionId === section.id)
    if (!row) continue

    const existing = byAuthor.get(section.author.id)
    if (existing) {
      existing.reportCount += row._count._all
      if (!existing.topics.includes(section.topic.name)) existing.topics.push(section.topic.name)
      if (row._max.publishDate && (!existing.latestAt || row._max.publishDate > existing.latestAt)) {
        existing.latestAt = row._max.publishDate
      }
      continue
    }

    byAuthor.set(section.author.id, {
      id: section.author.id,
      slug: section.author.slug,
      name: section.author.name,
      headline: section.author.headline,
      photoUrl: section.author.photoUrl,
      sortOrder: section.author.sortOrder,
      reportCount: row._count._all,
      topics: [section.topic.name],
      latestAt: row._max.publishDate,
    })
  }

  // The desk's own order first, then alphabetical — the same order the public pages use,
  // so a member does not meet the same people in two different sequences.
  return [...byAuthor.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ sortOrder: _sortOrder, ...expert }) => expert)
}
