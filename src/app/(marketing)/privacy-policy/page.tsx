import type { Metadata } from 'next'

import { SITE_DOMAIN } from '@/components/disclaimer'

export const metadata: Metadata = { title: 'Privacy Policy' }

/**
 * PLACEHOLDER — NOT LEGAL COPY.
 *
 * This page exists so the disclaimer's closing line links somewhere real rather than
 * dangling. The text below describes what the system actually does with member data,
 * which makes it a useful brief for a lawyer — but it has not been reviewed by one and
 * must be replaced with the client's approved policy before launch.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <span className="eyebrow">Legal</span>
      <h1 className="mt-3 text-4xl text-ink">Privacy Policy</h1>

      <div className="mt-8 rounded-lg border border-gold/40 bg-gold/10 px-5 py-4 text-[14px] leading-relaxed text-ink">
        <strong className="font-medium">Placeholder pending review.</strong> This describes the data
        the platform handles today and is provided as a drafting brief. It is not legal advice and
        must be replaced with an approved privacy policy before launch.
      </div>

      <div className="mt-10 space-y-8 text-[16px] leading-relaxed text-ink-dim">
        <section>
          <h2 className="mb-3 text-2xl text-ink">What we collect</h2>
          <p>
            When you buy a membership we receive the email address you provide at checkout and a
            payment confirmation from our crypto payment processor. We never receive or store your
            card details, wallet keys or any payment credentials. When you activate your account we
            store your email address, a securely hashed password, and — only if you choose to
            provide it — your name and a phone number for WhatsApp delivery.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">How we use it</h2>
          <p>
            We use your contact details to deliver the research you have paid for and to handle
            support requests. If you opt in to WhatsApp, we use your phone number solely to send you
            a link to each new report. We do not sell member data, and we do not share it with third
            parties other than the service providers that deliver our email and WhatsApp messages
            and host our infrastructure.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Access records</h2>
          <p>
            Because reports are restricted to members, we log each time a report is opened —
            including the account, time, IP address and browser used. These records protect the
            research from unauthorised redistribution and are retained for the life of the account.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Your choices</h2>
          <p>
            You can turn WhatsApp delivery off at any time in your account settings. You can request
            a copy of your data, correction of it, or deletion of your account by contacting us
            through {SITE_DOMAIN}. Deleting your account ends your access to the archive.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-ink">Security</h2>
          <p>
            Passwords are hashed, sessions are held in signed HTTP-only cookies, and report files are
            never served from public URLs — every view is authorised against a live member session.
            No system is perfectly secure, and we encourage you to use a unique password.
          </p>
        </section>
      </div>
    </div>
  )
}
