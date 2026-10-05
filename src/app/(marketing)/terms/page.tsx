import type { Metadata } from 'next'
import Link from 'next/link'

import { SITE_DOMAIN } from '@/components/disclaimer'
import { companyDetails } from '@/lib/company'

export const metadata: Metadata = { title: 'Terms of Service' }
export const dynamic = 'force-dynamic'

/**
 * DRAFT — NOT LEGAL COPY.
 *
 * Written the way the privacy policy was: every clause describes what the platform
 * actually does — how billing renews, what cancelling does, what sharing costs — so it
 * matches the FAQ word for word and makes a precise brief for a lawyer. It has not been
 * reviewed by one. The banner says so, and names the company details still unset, until
 * an approved version replaces this file.
 *
 * Refunds are deliberately left as an open question rather than written in: it is a
 * commercial decision with consumer-law consequences, and the FAQ does not answer it
 * either. Inventing a policy here would be a promise nobody made.
 */
export default function TermsPage() {
  const company = companyDetails()
  const operator = company.legalName ?? 'the operator of NordStar Pro'
  const contact = company.supportEmail ? (
    <a href={`mailto:${company.supportEmail}`} className="text-ink underline underline-offset-2">
      {company.supportEmail}
    </a>
  ) : (
    <>through {SITE_DOMAIN}</>
  )

  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <span className="eyebrow">Legal</span>
      <h1 className="mt-3 text-4xl text-ink">Terms of Service</h1>

      <div className="mt-8 rounded-lg border border-accent/40 bg-accent/10 px-5 py-4 text-[14px] leading-relaxed text-ink">
        <strong className="font-medium">Draft pending legal review.</strong> These terms describe how
        the service works today and are provided as a drafting brief. They must be replaced with
        approved terms before launch. Still to confirm: the refund policy
        {company.missing.length > 0 && <>, and the company details ({company.missing.join(', ')})</>}.
      </div>

      <div className="mt-10 space-y-8 text-[16px] leading-relaxed text-ink-dim">
        <section>
          <h2 className="mb-3 text-2xl text-ink">Who we are</h2>
          <p>
            NordStar Pro is operated by {operator}
            {company.address && <>, {company.address}</>}. By buying a subscription, activating an
            account or using the site, you agree to these terms, to our{' '}
            <Link href="/disclaimer" className="text-ink underline underline-offset-2">
              Disclaimer
            </Link>{' '}
            and to our{' '}
            <Link href="/privacy-policy" className="text-ink underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">What the service is, and is not</h2>
          <p>
            NordStar Pro publishes research on financial markets written by independent subject
            matter experts. It is general and impersonal: it is not written for your circumstances,
            and nothing on the site is a recommendation that you buy, sell or hold anything. The views
            in each report are its author&apos;s. Read the{' '}
            <Link href="/disclaimer" className="text-ink underline underline-offset-2">
              Disclaimer
            </Link>{' '}
            before relying on any of it, and speak to a licensed adviser about your own situation.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Subscriptions and payment</h2>
          <p>
            Each subscription covers the subject or package you bought, for the period you paid for.
            Card subscriptions renew automatically at the end of each period until you cancel. Crypto
            payments cannot renew automatically, so you pay again for each further period; we email
            you a few days before your access ends. After payment confirms you receive an access
            code by email, which you use once to activate your account.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Cancelling</h2>
          <p>
            If you pay by card, cancel from Manage billing in your account settings. You keep full
            access until the end of the period you have already paid for, and you are not charged
            again. If you pay in crypto there is nothing to cancel: simply do not renew.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Refunds</h2>
          <p>To be confirmed before launch. Until then, contact us {contact} about any payment.</p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Your licence to the research</h2>
          <p>
            A subscription gives you a personal, non-transferable licence to read the research you
            paid for. You may not share your account, forward or republish reports, or pass their
            contents on to anyone else. Each report view is tied to your account, watermarked and
            logged. Sharing your account or its contents is grounds for cancellation without refund.
            Firms that want access for several people, or the right to use material with their own
            clients, need a separate written licence — contact us {contact}.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Ownership</h2>
          <p>
            The research, the site and the NordStar Pro name belong to {operator} and the authors who
            license their work to it. Nothing in these terms transfers any of it to you.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Liability</h2>
          <p>
            The research is provided as is. To the extent the law allows, we are not liable for any
            loss arising from decisions you make using it, or for interruptions to the service.
            Nothing in these terms limits any right you have that the law does not allow us to limit.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Changes to these terms</h2>
          <p>
            We may update these terms. If a change materially affects a subscription you already hold,
            we will email you before it takes effect.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Governing law and contact</h2>
          <p>
            {company.governingLaw
              ? <>These terms are governed by the law of {company.governingLaw}. </>
              : null}
            Questions about these terms can be sent to us {contact}.
          </p>
        </section>
      </div>
    </div>
  )
}
