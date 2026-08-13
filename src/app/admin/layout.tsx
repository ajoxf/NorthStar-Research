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
  // The login page lives under /admin but must stay reachable while signed out.
  const pathname = headers().get('x-pathname') ?? ''
  const member = await getCurrentMember()

  if (!member || member.role !== 'admin') {
    if (!pathname.startsWith('/admin/login')) redirect('/admin/login')
    return <>{children}</>
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-panel-2">
        <header className="border-b border-line bg-bg">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
            <div className="flex items-center gap-6">
              <Link href="/admin" className="font-mono text-[13px] text-ink">
                NorthStar <span className="text-gold">admin</span>
              </Link>
              <AdminNav />
            </div>

            <div className="flex items-center gap-4">
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
