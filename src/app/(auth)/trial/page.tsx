import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { TrialForm } from '@/app/(auth)/trial/trial-form'
import { getCurrentMember } from '@/lib/auth'
import { trialOfferFor, trialOffers, type TrialOffer } from '@/lib/trial'

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
export default async function TrialPage({
  searchParams,
}: {
  searchParams?: { item?: string }
}) {
  /*
   * Which product, now that there can be more than one on trial.
   *
   * ?item names it. Without one: if exactly one trial is open, that is unambiguously what
   * somebody following a bare /trial link meant, so they get it — every existing link into
   * this page keeps working. With several open, guessing would sign somebody up to the
   * wrong thing, so they are asked.
   */
  const asked = searchParams?.item?.trim()
  const offer = asked ? await trialOfferFor(asked) : null
  if (asked && !offer) notFound()

  if (!offer) {
    const open = await trialOffers()
    if (open.length === 0) notFound()
    if (open.length > 1) return <TrialChooser offers={open} />
    return <TrialSignup offer={open[0]} />
  }

  return <TrialSignup offer={offer} />
}

async function TrialSignup({ offer }: { offer: TrialOffer }) {
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

      <TrialForm days={offer.days} itemSlug={offer.slug} />

      <p className="mt-8 border-t border-line pt-6 text-center text-[14px] text-ink-dim">
        Already have an account?{' '}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}

/**
 * Which one, when more than one is on trial.
 *
 * Only reached from a bare /trial with several offers open. Each is its own signup — the
 * offers are independent, and somebody may take all of them — so this is a list of doors
 * rather than a choice between them.
 */
function TrialChooser({ offers }: { offers: TrialOffer[] }) {
  return (
    <div className="w-full max-w-sm animate-fade-up">
      <span className="eyebrow">Free trial</span>
      <h1 className="mt-3 text-3xl text-ink">Which would you like to try?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        Each runs on its own. Taking one does not use up the others.
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        {offers.map((offer) => (
          <li key={offer.slug}>
            <Link
              href={`/trial?item=${encodeURIComponent(offer.slug)}`}
              className="group flex items-baseline justify-between gap-4 rounded-lg border border-line bg-panel-2 p-4 transition-colors hover:border-accent/40"
            >
              <span>
                <span className="block text-[16px] font-medium text-ink">{offer.name}</span>
                <span className="mt-1 block text-[13px] text-ink-dim">
                  {offer.isSection ? 'Research' : 'Platform'}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-medium text-accent">
                {offer.days} days free
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
