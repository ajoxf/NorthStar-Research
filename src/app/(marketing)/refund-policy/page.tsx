import Link from 'next/link'

import { Clause, FactEmail, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Refund and Cancellation Policy')

/**
 * Refund and Cancellation.
 *
 * Written around the question a subscription actually raises: not "did you finish it" but
 * "cancel before the next renewal, and what happens to the period already paid for".
 */
export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund and Cancellation Policy"
      intro={
        <p>
          {LEGAL.brand} sells subscriptions to ongoing research, billed monthly or yearly. You
          can cancel at any time. Cancelling stops the next payment; it does not end the period
          you have already paid for, and that period is not usually refunded. The details
          follow.
        </p>
      }
    >
      <Clause n="1" title="How billing works">
        <ul>
          <li>
            <strong>Card payments</strong> renew automatically at the end of each month or year
            until you cancel. Each renewal is charged at the price you signed up at, and a
            receipt is emailed to you.
          </li>
          <li>
            <strong>Crypto payments</strong> do not renew automatically. Each payment buys one
            period, added on top of any time you have left. We email you 3 days before your
            access ends; if you do not pay again, access simply stops.
          </li>
          <li>
            <strong>Free trials</strong> take no payment details and end on their own. Nothing
            is charged when a trial ends.
          </li>
        </ul>
      </Clause>

      <Clause n="2" title="Cancelling">
        <p>
          If you pay by card, cancel from your account page, which opens our card
          processor&apos;s billing portal. Your subscription then ends at the close of the
          period you have paid for: you keep access until then, and you are not charged again.
          If you pay in crypto, there is nothing to cancel; simply do not renew.
        </p>
        <p>You can cancel at any time, for any reason, without contacting us.</p>
        <ReviewNote>
          In the code, a subscription that Stripe ends immediately rather than at period end
          (for example one cancelled from the Stripe dashboard) cuts access at once. The member
          portal path cancels at period end, which matches this clause; staff should use the
          same path.
        </ReviewNote>
      </Clause>

      <Clause n="3" title="Refunds">
        <p>
          Because research is delivered as soon as you subscribe, and the full archive opens
          with it, payments are <strong>not refundable</strong> for a period that has started,
          including a partly used one. We will, however, refund you:
        </p>
        <ul>
          <li>
            if you were charged in error, for example twice for the same period, or after you
            had cancelled;
          </li>
          <li>
            if a renewal was charged and you ask for a refund within{' '}
            <strong>7 days</strong> of it, without having opened any research in that period;
          </li>
          <li>
            if we were unable to provide access for a significant part of a period because of a
            fault on our side;
          </li>
          <li>where the law where you live gives you a right to one.</li>
        </ul>
        <p>
          Refunds go back to the payment method you used. Card refunds are made through our
          card processor and usually reach you within 5 to 10 business days. Crypto refunds are
          made in the same asset to a wallet address you confirm to us, for the amount in that
          asset that we received, less the network fee.
        </p>
        <p>When a payment is refunded, the access it bought ends.</p>
        <ReviewNote>
          The 7-day, nothing-read renewal window is a proposal, not something the code enforces;
          it can be checked by hand from the reading log. Consumer law in some countries gives a
          cooling-off right that a subscriber can lose by starting to use digital content
          immediately, but only if they expressly agreed to that at checkout. There is currently
          no such acknowledgement at checkout. Also: the code does not yet end access when a
          refund is recorded, so staff must expire the entitlement and cancel the subscription
          by hand until that is built.
        </ReviewNote>
      </Clause>

      <Clause n="4" title="Changes of price">
        <p>
          If we change the price of something you subscribe to, your existing subscription
          continues at the price you signed up at. A new price applies only to new
          subscriptions.
        </p>
      </Clause>

      <Clause n="5" title="Discounts and promotional codes">
        <p>
          A discount reduces what you are charged, either for your first payment or for as long
          as you subscribe, as stated when you use it. A refund is of the amount you actually
          paid, never the undiscounted price. Discounts have no cash value.
        </p>
      </Clause>

      <Clause n="6" title="When we end a subscription">
        <p>
          Sharing your account, or redistributing research from it, breaches the{' '}
          <Link href="/terms" className="text-accent underline underline-offset-4">
            Terms and Conditions
          </Link>
          . If we end your subscription for that reason, no refund is due for the period in
          which it happened.
        </p>
        <p>
          If we stop offering a section or the platform as a whole, we will refund the unused
          part of any period you have paid for.
        </p>
      </Clause>

      <Clause n="7" title="Chargebacks">
        <p>
          If you think you have been charged wrongly, please contact us before disputing the
          payment with your bank; we can usually resolve it faster. If a payment is disputed,
          access paid for by that payment may be suspended while the dispute is open.
        </p>
      </Clause>

      <Clause n="8" title="How to ask for a refund">
        <p>
          Write to <FactEmail k="supportEmail" /> from the email address on your account, with
          the date and amount of the payment. If you are not happy with the answer, you can use
          our{' '}
          <Link href="/complaints" className="text-accent underline underline-offset-4">
            complaints procedure
          </Link>
          .
        </p>
      </Clause>
    </LegalPage>
  )
}
