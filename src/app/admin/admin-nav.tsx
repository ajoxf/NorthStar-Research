'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/sections', label: 'Sections' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/engagement', label: 'Reading' },
  { href: '/admin/enquiries', label: 'Enquiries' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/codes', label: 'Codes' },
  { href: '/admin/affiliates', label: 'Affiliates' },
  { href: '/admin/emails', label: 'Emails' },
]

/**
 * The console's own navigation, in one of two shapes.
 *
 * **Vertical is the real one**, on a laptop. Ten destinations laid out in a row ran out of
 * header before it ran out of links — "Emails" was cut off the end, and the only way to
 * reach it was to notice that a bar with no scrollbar could be scrolled. A column has room
 * for every label at once and for the next one somebody adds.
 *
 * **Horizontal survives for narrow screens**, where a rail would eat a third of the width
 * for navigation nobody is looking at. The layout shows exactly one of the two; this
 * renders whichever it is asked for rather than deciding, because the breakpoint is a
 * layout fact and belongs with the layout.
 */
export function AdminNav({
  orientation = 'horizontal',
}: {
  orientation?: 'horizontal' | 'vertical'
}) {
  const pathname = usePathname()
  const vertical = orientation === 'vertical'

  return (
    <nav
      aria-label="Admin sections"
      className={cn(
        vertical
          ? 'flex flex-col gap-0.5'
          : // `overflow-x-auto` with the scrollbar hidden: the row still scrolls on a
            // phone, it just does not draw a bar across the header to say so.
            '-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            // Announced to a screen reader, not just drawn. The styling below says which
            // page you are on to everybody who can see it and to nobody who cannot.
            aria-current={active ? 'page' : undefined}
            className={cn(
              'font-mono text-[12px] transition-colors',
              vertical
                ? 'relative flex items-center rounded-md px-3 py-2'
                : 'shrink-0 whitespace-nowrap rounded px-2.5 py-1.5',
              active
                ? 'bg-panel text-ink'
                : cn('text-ink-dim hover:text-ink', vertical && 'hover:bg-panel/60'),
            )}
          >
            {/*
              The accent marker, vertical only. A column of near-identical mono labels is
              harder to scan than a row of them — the eye has no length or position cue to
              go on — so the current one gets a mark at the edge as well as a panel behind
              it. In a row the panel alone is enough.
            */}
            {vertical && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full',
                  active ? 'bg-accent' : 'bg-transparent',
                )}
              />
            )}
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
