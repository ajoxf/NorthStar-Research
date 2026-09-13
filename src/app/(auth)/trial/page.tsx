import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { TrialForm } from '@/app/(auth)/trial/trial-form'
import { getCurrentMember } from '@/lib/auth'
import { currentTrialOffer } from '@/lib/trial'

export const metadata: Metadata = { title: 'Start a free trial' }

/**
 * Rendered per request, never prerendered.
 *
 * Whether this page exists depends on a setting an operator can change at any time. Left
 * to itself Next.js prerenders it at build time, and because the check runs before
 * anything reads a cookie it happily baked in the answer it got then — so switching trials
 * on left the page still serving the 404 it had been built with, until the next deploy.
 */
export const dynamic = 'force-dynamic'

/**
 * The trial signup page.
 *
 * 404s when trials are switched off rather than showing a disabled form — an offer that is
 * not open should not be visible at all, and a page that explains why it cannot help you is
 * worse than one that was never linked.
 *
 * Somebody already signed in is sent to their dashboard rather than shown this. Starting a
 * trial from an existing account is a button that belongs there, next to what they already
 * hold, not a second signup form that would refuse their email.
 */
export default async function TrialPage() {
  // One call: whether the offer exists, how long it runs and what it grants. The auth
  // layout and the public status endpoint ask the same question of the same function, so
  // the three cannot disagree about whether there is an offer here at all.
  const offer = await currentTrialOffer()
  if (!offer.open) notFound()

  const member = await getCurrentMember()
  if (member) redirect(member.role === 'admin' ? '/admin' : '/dashboard')

  return (
    <div className="w-full max-w-sm animate-fade-up">
      <span className="eyebrow">Free trial</span>
      <h1 className="mt-3 text-3xl text-ink">
        {offer.days} days of {offer.name}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        {offer.isSection
          ? 'Every report in it, including editions published before today. Read it properly before you decide — a summary of research is not research.'
          : 'The whole thing, not a cut-down version. Import your own fills and see your real book — that is the only way to judge it.'}
      </p>

      <TrialForm days={offer.days} />

      <p className="mt-8 border-t border-line pt-6 text-center text-[14px] text-ink-dim">
        Already have an account?{' '}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}
