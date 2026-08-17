import type { Metadata, Viewport } from 'next'

import { ReferralTracker } from '@/components/referral-tracker'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'NordStar Pro by Fincoursa — Technical and macro market research',
    // Sub-pages read "Payments · NordStar Pro by Fincoursa", so the parent brand travels
    // with every tab title rather than only appearing on the home page.
    template: '%s · NordStar Pro by Fincoursa',
  },
  description:
    'Three research reports every week covering commodities, international markets and indices, options, crypto and spreads, and FX. Educational and informational only.',
  robots: {
    // Member and admin areas are additionally blocked in robots.ts.
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded via <link> rather than next/font so the production build does not
            depend on reaching Google's font CDN at build time. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Records an affiliate click once per visit, wherever the link landed. Renders
            nothing and never blocks the page. */}
        <ReferralTracker />
      </body>
    </html>
  )
}
