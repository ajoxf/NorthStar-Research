import Link from 'next/link'

import { SITE_DOMAIN } from '@/components/disclaimer'
import { Clause, Fact, FactEmail, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { AGGREGATOR_STATEMENT, LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Terms and Conditions')

const link = 'text-accent underline underline-offset-4'

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and Conditions"
      intro={
        <p>
          These terms are the agreement between you and {LEGAL.entity} when you create an
          account on {LEGAL.brand}, start a free trial, redeem a code or buy a subscription.
          Please read them, and the documents they refer to, before you do.
        </p>
      }
    >
      <ReviewNote>
        Nothing in the signup, trial, redemption or checkout flows currently asks a person to
        accept these terms. Until it does, whether they bind a subscriber is doubtful. Adding an
        acceptance step (with the date and version recorded) is a code change for a later
        phase.
      </ReviewNote>

      <Clause n="1" title="About us and these terms">
        <p>
          {LEGAL.brand} is operated by {LEGAL.entity}, a company incorporated in{' '}
          <Fact k="country" /> under company number <Fact k="companyNumber" />, with its
          registered office at <Fact k="registeredAddress" />. You can contact us at{' '}
          <FactEmail k="supportEmail" />.
        </p>
        <p>
          These terms incorporate the{' '}
          <Link href="/disclaimer" className={link}>Risk Disclaimer</Link>, the{' '}
          <Link href="/privacy-policy" className={link}>Privacy Policy</Link> and the{' '}
          <Link href="/refund-policy" className={link}>Refund and Cancellation Policy</Link>.
        </p>
      </Clause>

      <Clause n="2" title="What the platform is">
        <p>
          <strong>{AGGREGATOR_STATEMENT}</strong>
        </p>
        <p>
          The research is written by independent subject matter experts, each publishing under
          their own name. We host it, sell subscriptions to it and pay the experts a share. We
          do not write it, check whether it is correct, or endorse it, and the experts are not
          our employees or agents.
        </p>
        <p>
          The research is general information. It is not a personal recommendation, it does not
          take account of your circumstances, and it is not investment, legal or tax advice. Any
          decision you make is yours. See the{' '}
          <Link href="/disclaimer" className={link}>Risk Disclaimer</Link>.
        </p>
      </Clause>

      <Clause n="3" title="Your account">
        <ul>
          <li>You must be at least 18, and able to enter into a binding contract where you live.</li>
          <li>The details you give us must be accurate, and you must keep them up to date.</li>
          <li>
            Your account is for you alone. You must not share your password or let anybody else
            use your account, and you are responsible for what happens on it.
          </li>
          <li>
            It is your responsibility to check that using a service like this one is lawful
            where you live.
          </li>
        </ul>
      </Clause>

      <Clause n="4" title="Subscriptions, trials and codes">
        <p>
          A subscription gives you access to the sections or packages you bought, for the
          period you paid for, including their archive. A section is one topic by one expert; a
          package is a bundle of sections. What you can read is decided by what you hold, and
          nothing else.
        </p>
        <ul>
          <li>
            <strong>Card subscriptions</strong> renew automatically at the end of each period at
            the price you signed up at, until you cancel.
          </li>
          <li>
            <strong>Crypto subscriptions</strong> run for the period paid for and do not renew
            automatically.
          </li>
          <li>
            <strong>Free trials</strong> are limited to one per person for each product, take no
            payment details, and end automatically.
          </li>
          <li>
            <strong>Access codes</strong> must be redeemed before they expire. The access they
            give starts on redemption and runs for the period the code states.
          </li>
        </ul>
        <p>
          Cancellation and refunds are covered by the{' '}
          <Link href="/refund-policy" className={link}>Refund and Cancellation Policy</Link>.
        </p>
      </Clause>

      <Clause n="5" title="Prices and payment">
        <p>
          Prices are shown before you pay, in the currency stated, normally US dollars. Card
          payments are processed by Stripe and crypto payments by Cregis, on their own terms; we
          never see your card details or wallet keys. You are responsible for any fees your bank,
          card issuer or wallet charges.
        </p>
        <ReviewNote>
          Whether prices include sales tax, VAT or GST, and who is responsible for collecting it,
          is the open tax question in the brief (§6). This clause needs a sentence on tax once
          that is decided.
        </ReviewNote>
      </Clause>

      <Clause n="6" title="Using the research">
        <p>
          The research is licensed to you for your own personal use while your subscription
          lasts. You may read it and take notes for yourself. You must not:
        </p>
        <ul>
          <li>
            copy, forward, publish, sell, or otherwise share any report, chart or extract with
            anybody else, including in a group chat, forum, social media post or another
            service;
          </li>
          <li>remove or obscure the watermark on any report;</li>
          <li>
            scrape, bulk-download or automate access to the platform, or use its content to
            train or prompt an AI system;
          </li>
          <li>use the research to provide a competing or paid service.</li>
        </ul>
        <p>
          Every report you open is watermarked with your account details and logged, so that
          shared copies can be traced. Breaching this clause is grounds for ending your
          subscription without a refund, and may lead to a claim against you.
        </p>
      </Clause>

      <Clause n="7" title="Intellectual property">
        <p>
          The research belongs to the expert who wrote it, or to us where they have assigned it.
          The platform, its design, its software and the {LEGAL.brand} name belong to us.
          Nothing in these terms transfers ownership of any of it to you.
        </p>
      </Clause>

      <Clause n="8" title="Acceptable use">
        <p>
          You must not interfere with the platform, try to reach parts of it you are not
          entitled to, impersonate anybody, or use it for anything unlawful.
        </p>
        <p>
          We and our experts will never contact you privately to ask for money, to offer to
          manage an account, or to provide trading services through WhatsApp, Telegram, Discord
          or social media direct messages. All official services are available only through{' '}
          {SITE_DOMAIN}. Anybody who contacts you claiming otherwise is not acting for us.
        </p>
      </Clause>

      <Clause n="9" title="Availability and changes">
        <p>
          We aim to keep the platform available but do not promise it will be uninterrupted or
          error-free. We may change, add or withdraw sections, experts, packages and features.
          If we withdraw something you have paid for, we will refund the unused part of the
          period. If we change these terms in a way that matters, we will tell you by email
          before the change takes effect; if you do not accept it, you may cancel.
        </p>
      </Clause>

      <Clause n="10" title="Ending your account">
        <p>
          You may stop using the platform and cancel at any time. We may suspend or end your
          account if you breach these terms, in particular clause 6, or if we are required to by
          law. Clauses 6, 7, 11 and 13 continue after your account ends.
        </p>
      </Clause>

      <Clause n="11" title="Our liability">
        <p>
          We are not liable for any trading or investment loss, or any loss of profit, that
          follows from a decision you make, whether or not it was informed by research on the
          platform. We are not responsible for the accuracy, completeness or timeliness of
          research written by experts.
        </p>
        <p>
          Our total liability to you for anything arising from these terms is limited to the
          amount you paid us in the 12 months before the claim arose. Nothing in these terms
          limits liability that cannot be limited by law, such as for fraud, or for death or
          personal injury caused by negligence, or removes rights you have as a consumer that
          cannot be removed.
        </p>
      </Clause>

      <Clause n="12" title="Complaints">
        <p>
          If something has gone wrong, please tell us first; see{' '}
          <Link href="/complaints" className={link}>Complaints Handling</Link>.
        </p>
      </Clause>

      <Clause n="13" title="Governing law">
        <p>
          These terms are governed by <Fact k="governingLaw" />. If you are a consumer, you also
          keep the protection of the mandatory laws of the country where you live.
        </p>
      </Clause>
    </LegalPage>
  )
}
