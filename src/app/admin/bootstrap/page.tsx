import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BootstrapForm } from '@/app/admin/bootstrap/bootstrap-form'
import { db } from '@/lib/db'
import { isPlaceholder } from '@/lib/env'

export const metadata: Metadata = {
  title: 'First-time setup',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * One-time setup screen for creating the first administrator.
 *
 * Disappears permanently the moment an admin exists — this page and its API route both
 * check, so there is no window where it lingers as an attack surface.
 */
export default async function AdminBootstrapPage() {
  const enabled = !isPlaceholder(process.env.ADMIN_BOOTSTRAP_SECRET)

  let adminExists = false
  let databaseReachable = true
  try {
    adminExists = (await db.member.count({ where: { role: 'admin' } })) > 0
  } catch {
    // The most likely reason to land here on a fresh deployment is that the database is
    // not provisioned or migrated yet. Say so, rather than showing a generic crash.
    databaseReachable = false
  }

  if (adminExists) redirect('/admin/login')

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-2 px-5 py-12">
      <div className="w-full max-w-md">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
          NorthStar Research
        </p>
        <h1 className="mt-2 font-mono text-xl text-ink">First-time setup</h1>
        <p className="mt-2 max-w-sm font-mono text-[12px] leading-relaxed text-ink-dim">
          Create the administrator account. This page stops working as soon as one exists.
        </p>

        {!databaseReachable ? (
          <div className="mt-7 rounded-lg border border-down/40 bg-down/10 p-5 text-[14px] leading-relaxed text-ink">
            <strong className="font-medium">The database is not reachable.</strong>
            <p className="mt-2 text-ink-dim">
              Provision Postgres (Storage → Create Database → Neon), then run{' '}
              <code className="font-mono text-gold">npx prisma db push</code> against it to create
              the tables. Reload this page afterwards.
            </p>
          </div>
        ) : !enabled ? (
          <div className="mt-7 rounded-lg border border-gold/40 bg-gold/10 p-5 text-[14px] leading-relaxed text-ink">
            <strong className="font-medium">Setup is disabled.</strong>
            <p className="mt-2 text-ink-dim">
              Add an <code className="font-mono text-gold">ADMIN_BOOTSTRAP_SECRET</code> environment
              variable in Vercel with a value of your choosing, redeploy, then reload this page.
              Remove it again once your admin account exists.
            </p>
          </div>
        ) : (
          <BootstrapForm />
        )}
      </div>
    </div>
  )
}
