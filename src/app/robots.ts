import type { MetadataRoute } from 'next'

import { appBaseUrl } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Belt and braces alongside the server-side session checks: nothing behind the
      // paywall should be crawled, indexed or surfaced in search results.
      disallow: ['/admin', '/admin/', '/dashboard', '/reports', '/archive', '/account', '/api/'],
    },
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  }
}
