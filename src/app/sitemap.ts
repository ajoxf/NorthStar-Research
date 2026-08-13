import type { MetadataRoute } from 'next'

import { appBaseUrl } from '@/lib/env'

/** Public pages only — everything behind the paywall is excluded by design. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl()
  const lastModified = new Date()

  return ['', '/join', '/faqs', '/disclaimer', '/privacy-policy'].map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.6,
  }))
}
