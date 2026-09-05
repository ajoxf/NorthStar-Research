import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { PortalNav } from '@/app/(portal)/portal-nav'
import { Wordmark } from '@/components/site-chrome'
import { Badge } from '@/components/ui/badge'
import { ToastProvider } from '@/components/ui/toast'
import { getCurrentMember, memberHasAnyAccess } from '@/lib/auth'
import { initials } from '@/lib/utils'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember()

  if (!member) {
    /*
     * Carry the destination through the sign-in.
     *
     * Without this a member following a link from an email — commonly on a second
     * device, where there is no session — signs in and lands on the dashboard rather
     * than the page they asked for. The link still "works", so the loss is invisible
     * to us and merely annoying to them, which is why it went unnoticed.
     */
    const pathname = headers().get('x-pathname')
    redirect(pathname ? `/login?next=${encodeURIComponent(pathname)}` : '/login')
  }

  const active = await memberHasAnyAccess(member)

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
            <div className="flex items-center gap-5">
              <Wordmark href="/dashboard" />
              <PortalNav isAdmin={member.role === 'admin'} />
            </div>

            <div className="flex items-center gap-3">
              {!active && <Badge tone="down">Inactive</Badge>}
              <Link
                href="/account"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel font-mono text-[11px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
                title={member.email}
              >
                {initials(member)}
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line px-5 py-7">
          <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-ink-dim/70">
            Reports are for educational and informational purposes only and are not financial advice.
            Trading involves substantial risk. Your access is personal to your account and every view
            is logged and watermarked.{' '}
            <Link href="/disclaimer" className="underline underline-offset-4 hover:text-ink-dim">
              Full disclaimer
            </Link>
            .
          </p>
        </footer>
      </div>
    </ToastProvider>
  )
}
