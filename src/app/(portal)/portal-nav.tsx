'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/dashboard', label: 'Reports' },
  { href: '/archive', label: 'Archive' },
  { href: '/tools', label: 'Tools' },
  { href: '/account', label: 'Account' },
]

export function PortalNav({
  isAdmin,
  isAffiliate,
  isExpert,
}: {
  isAdmin: boolean
  isAffiliate: boolean
  isExpert: boolean
}) {
  const links = [
    ...LINKS,
    ...(isExpert ? [{ href: '/expert', label: 'Expert' }] : []),
    ...(isAffiliate ? [{ href: '/affiliate', label: 'Affiliate' }] : []),
  ]
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active ? 'text-ink' : 'text-ink-dim hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        )
      })}

      {isAdmin && (
        <Link
          href="/admin"
          className="ml-1 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-accent transition-colors hover:text-ink"
        >
          Admin
        </Link>
      )}
    </nav>
  )
}
