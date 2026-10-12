'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/** What a reader gets. Tools is off the menu for now; its page still works by address. */
const READER_LINKS = [
  { href: '/dashboard', label: 'Reports' },
  { href: '/archive', label: 'Archive' },
]

/**
 * Only links the person can use. A subject matter expert or affiliate who does not
 * subscribe gets their own page and Account — Reports and Archive would only bounce them
 * to an empty dashboard. Someone who is both sees everything.
 */
export function PortalNav({
  isAdmin,
  canRead,
  isAffiliate,
  isExpert,
}: {
  isAdmin: boolean
  /** Holds something they can read: the same test the reports pages use. */
  canRead: boolean
  isAffiliate: boolean
  isExpert: boolean
}) {
  const own = [
    ...(isExpert ? [{ href: '/expert', label: 'Expert' }] : []),
    ...(isAffiliate ? [{ href: '/affiliate', label: 'Affiliate' }] : []),
  ]
  const account = { href: '/account', label: 'Account' }
  // A lapsed member who is neither keeps Reports: their dashboard is where renewing starts.
  const links = canRead || own.length === 0 ? [...READER_LINKS, account, ...own] : [...own, account]
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
          className="ml-1 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-ink transition-colors hover:text-ink"
        >
          Admin
        </Link>
      )}
    </nav>
  )
}
