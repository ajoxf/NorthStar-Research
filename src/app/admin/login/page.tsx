import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AdminLoginForm } from '@/app/admin/login/admin-login-form'
import { getCurrentMember } from '@/lib/auth'

export const metadata: Metadata = { title: 'Admin sign-in', robots: { index: false, follow: false } }

/**
 * Deliberately plain and obviously internal (build spec §5.2) — no marketing chrome, no
 * link to the member site. There is no public signup path to an admin account: the first
 * admin is seeded with `npm run create-admin`.
 */
export default async function AdminLoginPage() {
  const member = await getCurrentMember()
  if (member?.role === 'admin') redirect('/admin')

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-2 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            NorthStar Research
          </p>
          <h1 className="mt-2 font-mono text-xl text-ink">Admin console</h1>
          <p className="mt-2 font-mono text-[12px] text-ink-dim">Internal tool — staff only.</p>
        </div>

        <AdminLoginForm />
      </div>
    </div>
  )
}
