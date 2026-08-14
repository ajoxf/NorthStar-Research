import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/app/(auth)/login/login-form'
import { getCurrentMember } from '@/lib/auth'
import { googleConfigured } from '@/lib/oauth'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  google_failed: 'Google sign-in did not complete. Please try again.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_unverified: 'That Google account has no verified email address.',
  google_unavailable: 'Google sign-in is not available on this deployment yet.',
  link_expired: 'That sign-in link has expired. Request a new one.',
  link_invalid: 'That sign-in link is not valid.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string }
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

      {searchParams.error && ERRORS[searchParams.error] && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-down/40 bg-down/10 px-4 py-3 text-[14px] text-ink"
        >
          {ERRORS[searchParams.error]}
        </p>
      )}

      <LoginForm next={next} googleEnabled={googleConfigured()} />

      <p className="mt-7 border-t border-line pt-6 text-[14px] text-ink-dim">
        Have an access code but no account yet?{' '}
        <Link href="/redeem" className="text-accent underline underline-offset-4">
          Redeem it
        </Link>
      </p>
    </div>
  )
}
