import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/app/(auth)/login/login-form'
import { getCurrentMember } from '@/lib/auth'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const member = await getCurrentMember()

  // Only ever honour same-origin relative paths — an open redirect here would let a
  // "sign in to read your report" email bounce members onto an attacker's page.
  const next =
    searchParams.next && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//')
      ? searchParams.next
      : null

  if (member) redirect(next ?? (member.role === 'admin' ? '/admin' : '/dashboard'))

  return (
    <div className="w-full max-w-sm animate-fade-up">
      <span className="eyebrow">Members</span>
      <h1 className="mt-3 text-3xl text-ink">Sign in</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        {next
          ? 'Sign in to open the report you were sent.'
          : 'Access this week’s reports and the full archive.'}
      </p>

      <LoginForm next={next} />

      <p className="mt-7 border-t border-line pt-6 text-[14px] text-ink-dim">
        Have an access code but no account yet?{' '}
        <Link href="/redeem" className="text-gold underline underline-offset-4">
          Redeem it
        </Link>
      </p>
    </div>
  )
}
