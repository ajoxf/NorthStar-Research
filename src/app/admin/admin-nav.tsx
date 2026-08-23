'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/engagement', label: 'Reading' },
  { href: '/admin/enquiries', label: 'Enquiries' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/codes', label: 'Codes' },
  { href: '/admin/affiliates', label: 'Affiliates' },
  { href: '/admin/emails', label: 'Emails' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'shrink-0 whitespace-nowrap rounded px-2.5 py-1.5 font-mono text-[12px] transition-colors',
              active ? 'bg-panel text-ink' : 'text-ink-dim hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
