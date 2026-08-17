import 'server-only'

import { db } from '@/lib/db'
import { reportPortalUrl } from '@/lib/delivery'
import type { LatestReport } from '@/lib/notifications/types'

/**
 * The newest published edition, for pointing a brand-new member at something to read.
 *
 * Report delivery is a one-shot event at publish time — it emails whoever is active at
 * that moment — so somebody who joins an hour after an edition goes out receives no
 * email about it. They *can* read it: the dashboard and archive show everything
 * published, with no join-date cutoff. But their inbox stays empty until the next
 * edition, which can be days, and the first impression of a subscription they just paid
 * for is silence.
 *
 * This closes that gap in the one email they are guaranteed to get.
 *
 * Returns null rather than throwing when there is nothing published yet, or when the
 * lookup fails: a welcome email without a reading link is still a welcome email, and an
 * activated membership must never be reported as failed because of a decoration.
 */
export async function latestPublishedReport(): Promise<LatestReport | null> {
  try {
    const report = await db.report.findFirst({
      where: { published: true },
      orderBy: { publishDate: 'desc' },
      select: { id: true, title: true },
    })
    if (!report) return null
    return { title: report.title, url: reportPortalUrl(report.id) }
  } catch {
    return null
  }
}
