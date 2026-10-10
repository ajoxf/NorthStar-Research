import Link from 'next/link'

import { Clause, Fact, FactEmail, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Affiliate Policy')

const link = 'text-accent underline underline-offset-4'

/**
 * The Affiliate Policy. Net new: the source pack had nothing for people who promote the
 * platform for commission.
 */
export default function AffiliatePolicyPage() {
  return (
    <LegalPage
      title="Affiliate Policy"
      intro={
        <p>
          This policy applies to anybody who introduces new members to {LEGAL.brand} in return
          for a commission. It sits alongside your affiliate agreement with {LEGAL.entity}; if
          the two differ, the agreement applies.
        </p>
      }
    >
      <Clause n="1" title="Joining">
        <p>
          The affiliate programme is by invitation. We decide who to invite, and may decline or
          end any affiliate relationship. You must be at least 18, and you must be allowed,
          where you live, to promote a service like this one and be paid for it.
        </p>
      </Clause>

      <Clause n="2" title="How referrals are tracked">
        <ul>
          <li>
            You are given a personal link. When somebody follows it, a cookie in their browser
            records that they came from you for <strong>30 days</strong>.
          </li>
          <li>
            If they follow another affiliate&apos;s link within that time, the most recent link
            wins.
          </li>
          <li>
            You earn when a referred person <strong>pays</strong>. Visits, sign-ups and free
            trials earn nothing on their own.
          </li>
          <li>
            If a person blocks or clears cookies, uses another device, or pays with a different
            email from the one they signed up with, the referral may not be tracked. We cannot
            credit a sale we cannot see.
          </li>
        </ul>
      </Clause>

      <Clause n="3" title="Commission">
        <p>
          Your commission rate is set out in your affiliate agreement. It may be a percentage
          of the referred member&apos;s first payment, a fixed amount per paying member, or a
          number of free months on your own subscription. Commission is worked out on what the
          member actually paid, after any discount.
        </p>
        <p>
          Commission is a cost of the sale. It is paid by the platform and never reduces the
          price a member pays.
        </p>
      </Clause>

      <Clause n="4" title="When you are paid">
        <ul>
          <li>
            Commission is held for <strong>30 days</strong> from the date the member&apos;s
            payment clears, so that refunds and disputes can surface first.
          </li>
          <li>
            After that it becomes available, and you can ask for it to be paid. Every payout
            request is reviewed and approved before it is sent.
          </li>
          <li>
            Payouts are made by bank transfer or in crypto to the account or wallet you give us.
            You are responsible for giving correct details, and for any tax due on what you earn.
          </li>
        </ul>
        <ReviewNote>
          The 30-day holdback and approval step are the platform&apos;s decided design (brief §1
          and workstream 1). In the code today they apply only to experts; affiliate awards are
          recorded and settled by hand, with no holdback or clawback. Until the affiliate
          portal is built, staff must apply this clause manually.
        </ReviewNote>
      </Clause>

      <Clause n="5" title="Refunds and clawback">
        <p>
          If a payment you earned commission on is refunded or successfully disputed, the
          commission on it is cancelled. If it has already been paid to you, the amount is
          deducted from your next payout, or, if there is none, you must repay it on request.
        </p>
      </Clause>

      <Clause n="6" title="What you see">
        <p>
          You can see the number of visits, sign-ups and paying members you have introduced,
          and what you have earned, are owed and have been paid. You will not be told who any
          referred member is. Their identity is personal data, and we do not share it with
          affiliates.
        </p>
      </Clause>

      <Clause n="7" title="How you may promote the platform">
        <p>
          You must describe the platform accurately: an aggregator of research by independent
          subject matter experts, not a source of financial advice. You must make clear,
          wherever you share your link, that you earn a commission if somebody subscribes.
        </p>
        <p>
          <strong>You must not:</strong>
        </p>
        <ul>
          <li>
            make any claim about income, profit, returns or results that anybody has made, or
            could make, from the research, including your own, or show screenshots of trades or
            account balances alongside your link;
          </li>
          <li>
            describe the research as financial advice, a recommendation, a signal service that
            will make money, or anything guaranteed or risk-free;
          </li>
          <li>
            send unsolicited messages (email, SMS, WhatsApp, Telegram, direct messages or
            comments) to people who have not asked to hear from you;
          </li>
          <li>
            bid on {LEGAL.brand}, NordStar or Northstar, or any misspelling of them, in search or
            social advertising, or register domains, accounts or pages that use those names;
          </li>
          <li>
            present yourself as part of {LEGAL.brand}, as one of its experts, or as acting for
            it, or offer to manage anybody&apos;s money or account;
          </li>
          <li>
            share research from your own subscription, or offer cash back, a share of your
            commission or other inducements to people who use your link, unless we have agreed
            it in writing;
          </li>
          <li>refer yourself, or create accounts to earn commission on your own purchases.</li>
        </ul>
        <p>
          If you are unsure whether something is allowed, ask us first at{' '}
          <FactEmail k="supportEmail" />.
        </p>
      </Clause>

      <Clause n="8" title="Breaches and ending the relationship">
        <p>
          If you breach this policy, we may withhold or cancel commission earned through the
          breach, suspend your link, or end the relationship immediately. Either side may end the
          relationship at any time on notice. Commission already available and earned
          properly before the end will be paid once its holdback period has passed, subject to
          clause 5.
        </p>
      </Clause>

      <Clause n="9" title="Our relationship">
        <p>
          You are independent of {LEGAL.entity}: not an employee, agent or partner. You may not
          make commitments on our behalf. These terms are governed by{' '}
          <Fact k="governingLaw" />. See also the{' '}
          <Link href="/terms" className={link}>Terms and Conditions</Link> and{' '}
          <Link href="/conflicts-of-interest" className={link}>Conflicts of Interest</Link>.
        </p>
      </Clause>
    </LegalPage>
  )
}
