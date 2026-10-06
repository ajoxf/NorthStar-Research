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
        {/*
          Full width from `lg`, rather than the centred `max-w-6xl` this used to be.

          The brand sits in a column the exact width of the rail below it, so the two line
          up down the left edge instead of the rail hanging off the side of a centred
          header. Each page keeps its own `max-w-*` container, so the reading width of the
          console itself is unchanged — only the chrome around it moved.
        */}
        <header className="border-b border-line bg-bg">
          <div className="flex h-14 items-center gap-4 px-5">
            <Link
              href="/admin"
              className="shrink-0 font-mono text-[13px] text-ink lg:w-[176px]"
            >
              NordStar <span className="text-accent">admin</span>
            </Link>

            {/*
              `min-w-0` is what makes the nav's own horizontal scrolling work. A flex item
              defaults to `min-width: auto`, so without it this row refuses to shrink below
              the full width of every link — and instead of the nav scrolling, the whole
              admin console scrolled sideways on a phone, carrying the page content with it.
            */}
            <div className="flex min-w-0 flex-1 items-center lg:hidden">
              <AdminNav />
            </div>

            <div className="flex shrink-0 items-center gap-4 lg:ml-auto">
              <Link href="/dashboard" className="font-mono text-[12px] text-ink-dim hover:text-ink">
                Member view
              </Link>
              <span className="hidden font-mono text-[12px] text-ink-dim sm:inline">
                {member.email}
              </span>
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          {/*
            The rail. `px-2` against the links' own `px-3` puts their text at the same 20px
            from the edge as the brand's `px-5` above, so the column reads as one line
            rather than two that nearly agree.

            Sticky to the top of the viewport, not of the page: the members table and the
            reports list are both long, and navigation that scrolls away is navigation you
            have to scroll back for.
          */}
          <aside className="hidden w-[196px] shrink-0 border-r border-line bg-bg lg:block">
            <div className="sticky top-0 px-2 py-6">
              <AdminNav orientation="vertical" />
            </div>
          </aside>

          {/* `min-w-0` again: without it a wide table inside stretches this flex child and
              pushes the rail off the screen instead of scrolling within its own column. */}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
