import Link from 'next/link'

import { Clause, FactEmail, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Conflicts of Interest')

export default function ConflictsOfInterestPage() {
  return (
    <LegalPage
      title="Conflicts of Interest"
      intro={
        <p>
          A conflict of interest arises when somebody involved in producing or selling research
          has a reason to want a reader to reach a particular view. This policy sets out the
          conflicts that exist on {LEGAL.brand} and how they are handled.
        </p>
      }
    >
      <Clause n="1" title="How the platform earns">
        <p>
          {LEGAL.entity} earns from subscriptions. It does not earn from trades you make, from
          brokers or exchanges you use, or from the performance of any instrument discussed in
          the research. It accepts no payment from any issuer, broker or third party to publish,
          promote, rank or feature research.
        </p>
      </Clause>

      <Clause n="2" title="How experts earn">
        <p>
          Subject matter experts receive an agreed share of the net revenue from subscriptions
          to their own sections. Their pay depends on how many people subscribe to their work,
          not on whether any view they publish turns out to be right, and not on any trade a
          reader makes.
        </p>
        <p>
          That arrangement still creates an incentive, which we name rather than hide: an expert
          has a reason to make their work attractive to subscribers. Performance claims are the
          obvious risk, and section 5 deals with them.
        </p>
      </Clause>

      <Clause n="3" title="Positions held by experts">
        <p>
          An expert may hold, or have held, positions in instruments they write about. We
          require experts to:
        </p>
        <ul>
          <li>
            disclose, in the research itself, any position they hold in an instrument they are
            discussing at the time of publication;
          </li>
          <li>
            not trade against a view they have published in the period around its publication,
            in a way that would profit from readers acting on it;
          </li>
          <li>
            not accept payment from any third party to express a view about an instrument.
          </li>
        </ul>
        <ReviewNote>
          These obligations need to be mirrored in the expert agreement, with a defined
          blackout window around publication, for them to be enforceable. The window length is a
          commercial decision.
        </ReviewNote>
      </Clause>

      <Clause n="4" title="Affiliates">
        <p>
          Some members arrive through affiliates, who are paid a commission for introducing
          them. Affiliates are independent of the platform and of the experts, and they are
          prohibited from making income or performance claims; see the{' '}
          <Link href="/affiliate-policy" className="text-accent underline underline-offset-4">
            Affiliate Policy
          </Link>
          .
        </p>
      </Clause>

      <Clause n="5" title="Marketing, testimonials and reviews">
        <p>
          The platform does not publish claims about the returns any reader has made, or could
          make, from following research. Where member reviews are shown, they are limited to
          verified subscribers and are checked before they appear; a review that makes a
          performance or income claim is not published.
        </p>
      </Clause>

      <Clause n="6" title="Raising a concern">
        <p>
          If you believe a conflict has not been disclosed or has been handled badly, write to{' '}
          <FactEmail k="complaintsEmail" />. Concerns are handled under the{' '}
          <Link href="/complaints" className="text-accent underline underline-offset-4">
            Complaints Handling
          </Link>{' '}
          procedure.
        </p>
      </Clause>
    </LegalPage>
  )
}
