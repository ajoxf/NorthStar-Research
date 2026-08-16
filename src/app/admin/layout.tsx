import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { AdminNav } from '@/app/admin/admin-nav'
import { ToastProvider } from '@/components/ui/toast'
import { getCurrentMember } from '@/lib/auth'
import { headers } from 'next/headers'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Server-side gate for the whole console.
 *
 * Every /admin page inherits this check, and each admin API route repeats it
 * independently — a layout guard alone would not protect the routes (build spec §5.2).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Login and first-time setup live under /admin but must stay reachable while signed out.
  const pathname = headers().get('x-pathname') ?? ''
  const isPublicAdminRoute =
    pathname.startsWith('/admin/login') || pathname.startsWith('/admin/bootstrap')

  const member = await getCurrentMember()

  if (!member || member.role !== 'admin') {
    if (!isPublicAdminRoute) redirect('/admin/login')
    return <>{children}</>
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-panel-2">
        <header className="border-b border-line bg-bg">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
            {/*
              `min-w-0` is what makes the nav's own horizontal scrolling work. A flex item
              defaults to `min-width: auto`, so without it this row refuses to shrink below
              the full width of every link — and instead of the nav scrolling, the whole
              admin console scrolled sideways on a phone, carrying the page content with it.
            */}
            <div className="flex min-w-0 items-center gap-6">
              <Link href="/admin" className="shrink-0 font-mono text-[13px] text-ink">
                NordStar <span className="text-accent">admin</span>
              </Link>
              <AdminNav />
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <Link href="/dashboard" className="font-mono text-[12px] text-ink-dim hover:text-ink">
                Member view
              </Link>
              <span className="hidden font-mono text-[12px] text-ink-dim sm:inline">
                {member.email}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </ToastProvider>
  )
}
