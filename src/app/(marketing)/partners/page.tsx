import type { Metadata } from 'next'

import { PartnerForm } from '@/app/(marketing)/partners/partner-form'
import { Band, BandHeading, Eyebrow } from '@/components/band'
import { ATTRIBUTION_DAYS, normaliseSlug } from '@/lib/affiliates'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Become a partner',
  description: 'Share NordStar Pro research with your audience and earn on every subscription you bring in.',
}
export const dynamic = 'force-dynamic'

const POINTS = [
  { title: 'Your own link', body: `Anyone who subscribes within ${ATTRIBUTION_DAYS} days of following it is yours.` },
  { title: 'Commission on what they pay', body: 'A share of each payment before tax, agreed with you when we approve the application.' },
  { title: 'A dashboard of your own', body: 'Clicks, sign-ups, clients, a statement you can download, and withdrawals when you want them.' },
  { title: 'Bring in other partners', body: 'Partners you invite earn their own commission, and you earn an override on their sales on top.' },
]

/**
 * The public partner application. Applying grants nothing: an admin reviews every one, and
 * the link earns only once it is approved. See lib/partner-application.ts.
 */
export default async function PartnersPage({ searchParams }: { searchParams: { invite?: string } }) {
  // Named only when the invite is real, so a made-up ?invite= says nothing about who exists.
  const inviteSlug = normaliseSlug(searchParams.invite ?? '')
  const inviter = inviteSlug
    ? await db.affiliate.findFirst({ where: { slug: inviteSlug, status: 'active', parentAffiliateId: null }, select: { name: true } })
    : null

  return (
    <>
      <Band tone="dark">
        <div className="max-w-2xl">
          <Eyebrow tone="dark">Partners</Eyebrow>
          <h1 className="mt-4 text-balance font-display text-[36px] font-medium leading-[1.05] tracking-[-0.04em] text-ink sm:text-[52px]">
            Share research worth reading. Earn on every subscriber.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-dim">
            For analysts, educators, newsletters and communities whose audience trades. Apply below — we read every
            application and reply by email.
          </p>
        </div>
        <dl className="mt-12 grid gap-6 sm:grid-cols-2">
          {POINTS.map((point) => (
            <div key={point.title} className="border-t border-line pt-5">
              <dt className="text-[17px] text-ink">{point.title}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-ink-dim">{point.body}</dd>
            </div>
          ))}
        </dl>
      </Band>

      <Band tone="light">
        <div className="max-w-xl">
          <Eyebrow tone="light">Apply</Eyebrow>
          <BandHeading className="mt-4">Tell us about you.</BandHeading>
          {inviter && (
            <p className="mt-4 text-[16px] leading-relaxed text-ink-on-light-dim">
              You were invited by <span className="text-ink-on-light">{inviter.name}</span>.
            </p>
          )}
          <PartnerForm invite={inviter ? inviteSlug : null} />
        </div>
      </Band>
    </>
  )
}
