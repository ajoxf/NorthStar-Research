import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'NorthStar Research — Institutional-grade market research',
    template: '%s · NorthStar Research',
  },
  description:
    'Three research reports every week covering commodities, international markets and indices, and option, crypto and spread opportunities.',
  robots: {
    // Member and admin areas are additionally blocked in robots.ts.
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0f1c',
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
