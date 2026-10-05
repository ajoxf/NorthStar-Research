import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'

import { ReferralTracker } from '@/components/referral-tracker'
import { appBaseUrl } from '@/lib/env'
import './globals.css'

const DESCRIPTION =
  'Insight on commodities, FX, global indices, AI and related financial markets, supported by technical and macro research from experienced industry practitioners. Educational and informational only.'

export const metadata: Metadata = {
  /*
   * Every relative URL in metadata — the social preview image above all — resolves against
   * this. Without it, links shared on LinkedIn or X carry no preview, and those are the
   * channels the experts actually market through.
   */
  metadataBase: new URL(appBaseUrl()),
  title: {
    default: 'NordStar Pro — Technical and macro market research',
    // Sub-pages read "Payments · NordStar Pro", so the name travels with every tab title
    // rather than only appearing on the home page.
    template: '%s · NordStar Pro',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'NordStar Pro',
    title: 'NordStar Pro — Technical and macro market research',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NordStar Pro — Technical and macro market research',
    description: DESCRIPTION,
  },
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
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        {/*
          Satoshi is the design's typeface. Inter stays loaded as its fallback rather than
          being removed: Fontshare is a third party, and a page that loses its only webfont
          should fall back to something chosen rather than to whatever the device calls
          sans-serif. `display=swap` on both, so text paints immediately either way.
        */}
        <link
          href="https://api.fontshare.com/v2/css?f%5B%5D=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
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
        {/* Cookieless page analytics, so the funnel can be measured without a consent
            banner. Reports in the Vercel dashboard once Web Analytics is enabled on the
            project; until then it does nothing. */}
        <Analytics />
      </body>
    </html>
  )
}
