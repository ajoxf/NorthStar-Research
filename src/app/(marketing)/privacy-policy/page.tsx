import { Clause, Fact, FactEmail, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Privacy Policy')

/**
 * The Privacy Policy.
 *
 * Every statement about what is collected, who receives it and what the cookies are was
 * taken from the code as it stands, not from what a policy usually says. If the code
 * changes what it collects or who it sends data to, this page has to change with it.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data {LEGAL.brand} collects, why, who it is shared
          with, how long it is kept, and the rights you have over it.
        </p>
      }
    >
      <Clause n="1" title="Who is responsible for your data">
        <p>
          {LEGAL.entity}, incorporated in <Fact k="country" /> under company number{' '}
          <Fact k="companyNumber" />, with its registered office at{' '}
          <Fact k="registeredAddress" />, is responsible for your personal data. Questions about
          this policy, or requests about your data, go to <FactEmail k="privacyEmail" />.
        </p>
      </Clause>

      <Clause n="2" title="What we collect">
        <p>
          <strong>Your account.</strong> Your email address and a password, which we store only
          as a one-way hash, or, if you sign in with Google, your Google account identifier and
          the first and last name Google provides. Your first and last name, and a mobile
          number, which is required when you activate a membership with a code. A WhatsApp
          number, if you choose to give one.
        </p>
        <p>
          <strong>Your subscriptions.</strong> What you have bought or been given access to,
          when it started, when it renews or ends, how you paid, and any free trial you have
          taken. For card payments we keep the identifiers our card processor gives us for your
          customer record and subscription. For each order we keep the email and phone number
          used, the amount, and the confirmation our payment processor sends back.
        </p>
        <p>
          <strong>Your reading.</strong> Every time you open a report we record which report,
          when, your IP address and your browser&apos;s user-agent string. We also record when
          you last signed in and last read something.
        </p>
        <p>
          <strong>Email delivery.</strong> For each email we send you, whether it was sent,
          delivered, opened or clicked, or failed, as reported back by our email provider.
        </p>
        <p>
          <strong>Support and account notes.</strong> Messages you send us, and internal notes
          and tags our team adds to your account to handle support and renewals.
        </p>
        <p>
          <strong>Referrals.</strong> If you arrive through an affiliate&apos;s link, we record
          that a visit came through that link, without your name or IP address. If you later
          sign up or pay, we link the referral to your email so the affiliate can be credited.
          The affiliate sees counts and amounts only, never who you are.
        </p>
        <p>
          We do not collect or store your card number, bank details or wallet keys. Those are
          handled by the payment processors in section 4.
        </p>
      </Clause>

      <Clause n="3" title="Why we use it">
        <ul>
          <li>
            <strong>To provide what you paid for:</strong> creating your account, granting and
            ending access, delivering research by email, processing payments and renewals, and
            sending receipts and renewal reminders. This is necessary to perform our contract
            with you.
          </li>
          <li>
            <strong>To protect the research:</strong> reports are watermarked with your email
            address and part of your account identifier, and every view is logged, so that
            unauthorised sharing can be traced. This is in our legitimate interest, and in the
            experts&apos; interest, in protecting work that is sold by subscription.
          </li>
          <li>
            <strong>To run the business:</strong> handling support, keeping financial records,
            paying experts and affiliates their share, and meeting legal and tax obligations.
          </li>
          <li>
            <strong>To contact you about your account</strong>, including by phone or WhatsApp
            where you have given us a number. We do not send research to your phone.
          </li>
        </ul>
        <p>
          We do not sell your data, and we do not use it for advertising. Subject matter experts
          do not receive your name or contact details: they see only aggregate figures, such as
          how many people subscribe to their work.
        </p>
      </Clause>

      <Clause n="4" title="Who we share it with">
        <p>Only the service providers that run the platform for us:</p>
        <ul>
          <li>
            <strong>Stripe</strong>, for card payments: your email address and what you are
            buying. Stripe collects your card details directly.
          </li>
          <li>
            <strong>Cregis</strong>, for crypto payments: your email address, an order
            reference, the amount and the plan name.
          </li>
          <li>
            <strong>Resend</strong>, which sends our email: your email address, your first name
            and the content of each message.
          </li>
          <li>
            <strong>Google</strong>, if you choose to sign in with Google.
          </li>
          <li>
            <strong>Vercel</strong>, which hosts the website and stores report files, and{' '}
            <strong>Neon</strong>, which hosts our database.
          </li>
          <li>
            <strong>Google Fonts and Fontshare</strong>, which serve the typefaces on every
            page. Your browser requests them directly, so those services receive your IP
            address.
          </li>
        </ul>
        <p>
          We may also disclose data where the law requires it, or to protect our rights, for
          example in a dispute about unauthorised sharing of research.
        </p>
        <ReviewNote>
          Several of these providers are based in, or process data in, the United States and
          elsewhere. A section on international transfers, and the safeguards relied on, depends
          on the country of incorporation and should be added in review.
        </ReviewNote>
      </Clause>

      <Clause n="5" title="Cookies and browser storage">
        <p>We use a small number of cookies, all needed for the site to work. We use no analytics or advertising cookies.</p>
        <ul>
          <li>
            <strong>nsr_session</strong>: keeps you signed in. 30 days.
          </li>
          <li>
            <strong>nsr_oauth_state</strong>: protects Google sign-in against forgery. 10 minutes,
            and removed once you are signed in.
          </li>
          <li>
            <strong>nsr_ref</strong>: remembers which affiliate link you arrived through, so the
            affiliate can be credited if you subscribe. 30 days.
          </li>
          <li>
            <strong>nsp_admin_theme</strong>: remembers the light or dark choice in our staff
            console. Staff only.
          </li>
        </ul>
        <p>
          Your browser also stores whether you have turned off the page-turn sound in the
          reader, and, for the current visit only, whether an affiliate visit has already been
          counted.
        </p>
      </Clause>

      <Clause n="6" title="How long we keep it">
        <ul>
          <li>
            <strong>Account, subscription and reading records:</strong> for as long as you have
            an account, and afterwards for as long as needed to resolve disputes about access or
            sharing.
          </li>
          <li>
            <strong>Orders, payments, refunds and payouts:</strong> for as long as tax and
            accounting law requires.
          </li>
          <li>
            <strong>Complaints:</strong> 3 years from our final response.
          </li>
        </ul>
        <ReviewNote>
          The platform currently deletes nothing: records of purchases and payments are kept
          permanently by design, and there is no account-deletion function in the code. The
          periods above need to be confirmed against the governing law, and a deletion process
          (likely: erase or anonymise the account and reading records, keep the financial
          records the law requires) needs building before this section can be published.
        </ReviewNote>
      </Clause>

      <Clause n="7" title="Your rights">
        <p>
          Depending on where you live, you may have the right to see the data we hold about you,
          to have it corrected, to have it deleted, to object to or restrict how we use it, and
          to receive a copy of it in a portable form. You can change your name, phone number and
          password yourself in your account settings. For anything else, write to{' '}
          <FactEmail k="privacyEmail" /> from the email address on your account. We will respond
          within one month.
        </p>
        <p>
          Some data cannot be deleted while we have a legal reason to keep it, such as payment
          records. Deleting your account ends your access to anything you had subscribed to.
        </p>
        <p>
          You also have the right to complain to the data protection authority where you live
          or where we are established.
        </p>
      </Clause>

      <Clause n="8" title="Security">
        <p>
          Passwords are stored only as salted hashes. Sessions are held in signed cookies that
          scripts on the page cannot read. Report files are never served from public addresses:
          every view is checked against a signed-in account. Payment credentials stored for our
          own use are encrypted. No system is perfectly secure, and we encourage you to use a
          password you do not use anywhere else.
        </p>
      </Clause>

      <Clause n="9" title="Changes to this policy">
        <p>
          If we change this policy in a way that matters, we will tell you by email before the
          change takes effect. The date at the top of this page shows when it last changed.
        </p>
      </Clause>
    </LegalPage>
  )
}
