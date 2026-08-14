'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/codes', label: 'Codes' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded px-2.5 py-1.5 font-mono text-[12px] transition-colors',
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
