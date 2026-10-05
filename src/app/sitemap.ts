import type { MetadataRoute } from 'next'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { sectionsPublic } from '@/lib/sections-mode'

export const dynamic = 'force-dynamic'

/** Pages that are public whatever the desk has switched on. */
const ALWAYS = ['', '/join', '/faqs', '/terms', '/disclaimer', '/privacy-policy']

/**
 * Public pages only — everything behind the paywall is excluded by design.
 *
 * /coverage, /experts and each expert's page are listed only while the sections surface
 * is public, which is the same switch that makes them stop 404ing. Listing them while
 * they 404 would hand search engines a sitemap full of dead links; leaving them out once
 * they are live hides the most search-worthy pages on the site — the named people.
 *
 * The database is asked, so it can fail. A sitemap that errors serves nothing at all, so
 * a failed lookup degrades to the always-public pages rather than taking those down too.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl()
  const lastModified = new Date()

  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: 'weekly',
    priority,
  })

  const pages = ALWAYS.map((path) => entry(path, path === '' ? 1 : 0.6))

  try {
    if (!(await sectionsPublic())) return pages

    const authors = await db.author.findMany({
      where: { archivedAt: null },
      select: { slug: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return [
      ...pages,
      entry('/coverage', 0.8),
      entry('/experts', 0.8),
      ...authors.map((author) => entry(`/experts/${author.slug}`, 0.7)),
    ]
  } catch (error) {
    console.error('[sitemap] could not list expert pages', error)
    return pages
  }
}
