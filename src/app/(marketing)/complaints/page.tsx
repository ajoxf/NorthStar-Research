import { Clause, Fact, FactEmail, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Complaints Handling')

export default function ComplaintsPage() {
  return (
    <LegalPage
      title="Complaints Handling"
      intro={
        <p>
          If something has gone wrong, we want to hear about it and put it right. This page
          explains how to complain, what we will do, and how long it will take.
        </p>
      }
    >
      <Clause n="1" title="What you can complain about">
        <p>
          Anything to do with your account or subscription: billing, access, cancellation and
          refunds, how your personal data has been handled, the conduct of an affiliate who
          introduced you, or a concern about research published on the platform, including an
          undisclosed conflict of interest.
        </p>
        <p>
          A disagreement with an expert&apos;s view, or the outcome of a decision you made after
          reading research, is not on its own a complaint we can uphold: the research is
          general, the views are the expert&apos;s, and decisions are yours. We will still read
          what you send, and pass it to the expert where that is useful.
        </p>
      </Clause>

      <Clause n="2" title="How to complain">
        <p>
          Email <FactEmail k="complaintsEmail" /> from the address on your account, or write to{' '}
          {LEGAL.entity}, <Fact k="registeredAddress" />. Please include:
        </p>
        <ul>
          <li>your name and the email address on your account;</li>
          <li>what happened, and when;</li>
          <li>what you would like us to do to put it right;</li>
          <li>any receipts, screenshots or messages that help.</li>
        </ul>
        <p>
          You do not have to use any particular wording, and a complaint made any other way,
          for example as a reply to one of our emails, will still be treated as a complaint.
        </p>
      </Clause>

      <Clause n="3" title="What happens next">
        <ul>
          <li>
            <strong>Acknowledgement</strong> within 10 business days, telling you who is
            handling your complaint.
          </li>
          <li>
            <strong>A final response</strong> within 4 weeks of receiving it, setting out what
            we found, what we will do, and why. If we need longer, we will tell you before the 4
            weeks are up, explain why, and say when you can expect an answer.
          </li>
          <li>
            Complaints about billing or access that we can fix straight away will usually be
            fixed straight away, without waiting for either deadline.
          </li>
        </ul>
        <ReviewNote>
          10 business days and 4 weeks are working standards chosen for this platform, not requirements taken from
          any particular regulator. If the regulatory status in section 2 of the Regulatory
          Status page brings a specific complaints regime with it, these timings and section 4
          must follow that regime instead.
        </ReviewNote>
      </Clause>

      <Clause n="4" title="If you are not satisfied">
        <p>
          If you are unhappy with our final response, reply to it and the complaint will be
          reviewed by somebody senior who was not involved in the first decision.
        </p>
        <p>
          You may also be able to refer the matter to an external body:{' '}
          <Fact k="governingLaw" />.
        </p>
        <ReviewNote>
          Which external body, if any, a member can go to (an ombudsman, a consumer authority,
          an alternative dispute resolution scheme) depends on where the company is
          incorporated and on its regulatory status. The marker above stands in for that
          answer.
        </ReviewNote>
      </Clause>

      <Clause n="5" title="Records">
        <p>
          We keep a record of every complaint and how it was resolved, and review them together
          to find problems that keep recurring. Complaint records are kept for{' '}
          <strong>3 years</strong> from the final response.
        </p>
      </Clause>
    </LegalPage>
  )
}
