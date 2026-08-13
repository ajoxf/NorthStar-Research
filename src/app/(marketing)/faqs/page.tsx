import type { Metadata } from 'next'
import Link from 'next/link'

import { PLAN } from '@/lib/env'

export const metadata: Metadata = { title: 'FAQs' }

/**
 * PLACEHOLDER WORDING — answers describe how the platform actually behaves, but the
 * client should confirm the commercial answers (refunds, cadence, support) before launch.
 */
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What do I get for the membership fee?',
    a: (
      <>
        One payment of ${PLAN.priceUsd} gives you all three weekly reports — commodities,
        international markets and indices, and option, crypto and spread opportunities — plus access
        to the complete archive of everything published previously.
      </>
    ),
  },
  {
    q: 'How do I pay?',
    a: (
      <>
        Payment is made in crypto through our payment processor. NorthStar Research never handles
        your payment details. Once payment confirms, you receive a one-time access code by email
        that you use to create your account.
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
    q: 'Can I get the reports on WhatsApp?',
    a: (
      <>
        Yes. Add and verify a phone number in your account settings and we will send a link to each
        new report there as well as by email. The message contains a link into your member portal —
        never the research itself — so you will need to be signed in to read it.
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
        No. Everything we publish is for educational and informational purposes only. Please read the{' '}
        <Link href="/disclaimer" className="text-gold underline underline-offset-4">
          full disclaimer
        </Link>{' '}
        before acting on anything in a report.
      </>
    ),
  },
]

export default function FaqsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <span className="eyebrow">Support</span>
      <h1 className="mt-3 text-4xl text-ink">Frequently asked questions</h1>

      <dl className="mt-12 divide-y divide-line border-y border-line">
        {FAQS.map((faq) => (
          <div key={faq.q} className="py-7">
            <dt className="font-serif text-xl text-ink">{faq.q}</dt>
            <dd className="mt-3 text-[16px] leading-relaxed text-ink-dim">{faq.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
