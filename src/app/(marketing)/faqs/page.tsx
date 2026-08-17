import type { Metadata } from 'next'
import Link from 'next/link'

import { formatPrice } from '@/lib/package-shape'
import { defaultPackage } from '@/lib/packages'

export const metadata: Metadata = { title: 'FAQs' }

/**
 * PLACEHOLDER WORDING — answers describe how the platform actually behaves, but the
 * client should confirm the commercial answers (refunds, cadence, support) before launch.
 */
// A function of the price rather than a module constant, so the answer below quotes
// whatever the default package currently costs instead of a figure frozen at import time.
const faqs = (price: string): { q: string; a: React.ReactNode }[] => [
  {
    q: 'What do I get for the membership fee?',
    a: (
      <>
        {price} per month gives you every weekly report — three a week, covering
        commodities, international markets and indices, options, crypto and spreads, and FX — plus
        access to the complete archive of everything published previously, including editions from
        before you joined.
      </>
    ),
  },
  {
    q: 'How do I pay, and does it renew?',
    a: (
      <>
        You can pay by card or in crypto. Card subscriptions renew automatically each month and can
        be cancelled any time from your account. Crypto cannot renew automatically — there is no
        card on file for us to charge — so you pay again whenever you want another month, and we
        email you a few days before your access ends. Either way, NordStar Pro never handles
        your payment details, and you receive an access code once payment confirms.
      </>
    ),
  },
  {
    q: 'How do I cancel?',
    a: (
      <>
        If you pay by card, open your account settings and choose Manage billing — you can cancel
        there in a couple of clicks and keep full access until the end of the period you have
        already paid for. If you pay in crypto there is nothing to cancel: simply do not renew.
      </>
    ),
  },
  {
    q: 'How do I sign in?',
    a: (
      <>
        However you prefer: continue with Google, use an email and password, or have us email you a
        sign-in link. They all reach the same account, so you can switch between them freely.
      </>
    ),
  },
  {
    q: 'I paid but have not received my code.',
    a: (
      <>
        Codes are issued only after the payment network confirms the transaction, which can take a
        few minutes. Check your spam folder first. If it still has not arrived, contact support with
        the email address you used at checkout.
      </>
    ),
  },
  {
    q: 'How are the reports delivered?',
    a: (
      <>
        By email. Each notification contains a link into your member portal — never the research
        itself — so you will need to be signed in to read it. The report then renders page by page
        in the portal, charts included, on a phone as well as a desktop.
      </>
    ),
  },
  {
    q: 'Why does the link in my email ask me to sign in?',
    a: (
      <>
        Reports are for members only, so every link resolves to your member portal and checks your
        session before showing anything. After signing in you are taken straight to the report you
        clicked. This is also why forwarding a link does not give anyone else access.
      </>
    ),
  },
  {
    q: 'Can I share reports with a friend?',
    a: (
      <>
        No. Each report view is signed to your account and carries a watermark identifying it, and
        access is logged. Sharing your account or its contents is grounds for cancellation without
        refund.
      </>
    ),
  },
  {
    q: 'Is this financial advice?',
    a: (
      <>
        No. Everything we publish is for educational and informational purposes only, and nothing
        in a report is a recommendation to buy or sell anything. Please read the{' '}
        <Link href="/disclaimer" className="text-accent underline underline-offset-4">
          full disclaimer
        </Link>
        .
      </>
    ),
  },
]

export default async function FaqsPage() {
  const plan = await defaultPackage()
  const FAQS = faqs(formatPrice(plan.priceCents, plan.currency))

  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <span className="eyebrow">Support</span>
      <h1 className="mt-3 text-4xl text-ink">Frequently asked questions</h1>

      <dl className="mt-12 divide-y divide-line border-y border-line">
        {FAQS.map((faq) => (
          <div key={faq.q} className="py-7">
            <dt className="font-display text-xl text-ink">{faq.q}</dt>
            <dd className="mt-3 text-[16px] leading-relaxed text-ink-dim">{faq.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
