import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/app/(auth)/login/login-form'
import { getCurrentMember } from '@/lib/auth'
import { trialOffers } from '@/lib/trial'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  google_failed: 'Google sign-in did not complete. Please try again.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_unverified: 'That Google account has no verified email address.',
  google_unavailable:
    'Google sign-in is not set up on this deployment yet. Use your email and password, or request a sign-in link.',
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

  /*
   * Offered only while a trial is actually open, so this never points at a page that 404s.
   * Several can run at once now; /trial shows the one when there is one and asks which
   * when there are more, so this stays a single link either way.
   */
  const offers = await trialOffers()

  return (
    <div className="w-full max-w-sm animate-fade-up">
      <span className="eyebrow">Members</span>
      <h1 className="mt-3 text-3xl text-ink">Sign in</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        {next
          ? 'Sign in to open the report you were sent.'
          : 'Your research, your archive and everything you hold.'}
      </p>

      {searchParams.error && ERRORS[searchParams.error] && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-down/40 bg-down/10 px-4 py-3 text-[14px] text-ink"
        >
          {ERRORS[searchParams.error]}
        </p>
      )}

      <LoginForm next={next} />

      <div className="mt-7 flex flex-col gap-2 border-t border-line pt-6 text-[14px] text-ink-dim">
        <p>
          Have an access code but no account yet?{' '}
          <Link href="/redeem" className="text-accent underline underline-offset-4">
            Redeem it
          </Link>
        </p>

        {offers.length > 0 && (
          <p>
            No account at all?{' '}
            <Link href="/trial" className="text-accent underline underline-offset-4">
              {offers.length === 1
                ? `Start a ${offers[0].days}-day free trial`
                : 'Start a free trial'}
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
