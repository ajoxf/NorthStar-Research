import type { MetadataRoute } from 'next'

import { appBaseUrl } from '@/lib/env'
import { LEGAL_DOCUMENTS, LEGAL_REVIEWED } from '@/lib/legal'

/** Public pages only — everything behind the paywall is excluded by design. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl()
  const lastModified = new Date()

  // The legal pack is listed only once reviewed. Until then its pages ask not to be
  // indexed, and a sitemap pointing at them would contradict that.
  const legal = LEGAL_REVIEWED ? ['/legal', ...LEGAL_DOCUMENTS.map((doc) => doc.href)] : []

  return ['', '/join', '/faqs', ...legal].map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.6,
  }))
}
