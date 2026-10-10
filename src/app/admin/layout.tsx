import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { AdminNav } from '@/app/admin/admin-nav'
import { ToastProvider } from '@/components/ui/toast'
import { getCurrentMember } from '@/lib/auth'
import { cookies, headers } from 'next/headers'

import { SignOutButton, ThemeToggle } from '@/app/admin/admin-header-actions'
import { ADMIN_THEME_COOKIE, parseAdminTheme } from '@/lib/admin-theme'

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
  const theme = parseAdminTheme(cookies().get(ADMIN_THEME_COOKIE)?.value)

  /*
   * The wrapper every admin surface sits inside. It carries the theme, which redefines the
   * colour tokens beneath it (globals.css), and the console's larger sizes for the shared
   * label, hint and badge components, which read them with the site's sizes as fallback.
   */
  const wrapperProps = {
    'data-admin-theme': theme,
    style: {
      '--ui-label-size': '12px',
      '--ui-hint-size': '14px',
      '--ui-badge-size': '11px',
    } as React.CSSProperties,
  }

  if (!member || member.role !== 'admin') {
    if (!isPublicAdminRoute) redirect('/admin/login')
    return (
      <div {...wrapperProps} className="min-h-screen bg-bg text-ink">
        {children}
      </div>
    )
  }

  return (
    <ToastProvider>
      <div {...wrapperProps} className="flex min-h-screen flex-col bg-panel-2 text-ink">
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
              className="shrink-0 font-mono text-[15px] text-ink lg:w-[176px]"
            >
              NordStar <span className="text-accent-ink">admin</span>
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <Link
                href="/dashboard"
                className="hidden font-mono text-[14px] text-ink-dim hover:text-ink sm:inline"
              >
                Member view
              </Link>
              <span className="hidden font-mono text-[14px] text-ink-dim md:inline">
                {member.email}
              </span>
              <ThemeToggle initial={theme} />
              <SignOutButton />
            </div>
          </div>

          {/*
            Below `lg`, the nav is its own row under the bar rather than sharing it. Sharing
            worked while the bar held only a link and an email; with the theme switch and
            sign out beside them, a phone had no width left and the nav shrank to nothing.

            The nav scrolls sideways within this row (see AdminNav) rather than pushing the
            whole console wider than the screen.
          */}
          <div className="border-t border-line px-5 py-1.5 lg:hidden">
            <AdminNav />
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
