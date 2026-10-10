import { Clause, Fact, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { AGGREGATOR_STATEMENT, LEGAL } from '@/lib/legal'

export const metadata = legalMetadata('Regulatory Status')

export default function RegulatoryStatusPage() {
  return (
    <LegalPage
      title="Regulatory Status"
      intro={
        <p>
          This page explains who operates {LEGAL.brand}, what kind of service it is, and how it
          is regulated. Read it before relying on anything published on the platform.
        </p>
      }
    >
      <ReviewNote>
        The status statement in section 2 has to come from the lawyer. It decides whether this
        page says the platform is authorised (and by whom) or that it is not, and everything
        else on the page follows from it. Nothing here should be published until it is
        settled.
      </ReviewNote>

      <Clause n="1" title="Who we are">
        <p>
          {LEGAL.brand} is a platform operated by {LEGAL.entity}, a company incorporated in{' '}
          <Fact k="country" /> under company number <Fact k="companyNumber" />, with its
          registered office at <Fact k="registeredAddress" />.
        </p>
      </Clause>

      <Clause n="2" title="Regulatory status">
        <p>
          <Fact k="regulatoryStatus" />
        </p>
      </Clause>

      <Clause n="3" title="What the platform does">
        <p>{AGGREGATOR_STATEMENT}</p>
        <p>
          The platform hosts research written by independent subject matter experts and sells
          subscriptions to it. It does not manage money, hold client funds or assets for
          investment, execute or arrange trades, or recommend that any particular person buy
          or sell anything.
        </p>
        <p>
          Research on the platform is general. It is not prepared for your circumstances, does
          not take account of your objectives, financial situation or needs, and is not a
          personal recommendation.
        </p>
      </Clause>

      <Clause n="4" title="What this means for you">
        <ul>
          <li>
            Protections that apply to clients of a regulated investment adviser or firm, such as
            suitability assessments and, where they exist, compensation schemes, may not apply
            to your use of this platform.
          </li>
          <li>
            Before acting on anything you read here, consider taking advice from an adviser who
            is authorised in your country and who knows your circumstances.
          </li>
          <li>
            Whether you may lawfully use a service like this one, or act on research of this
            kind, depends on the rules where you live. That is your responsibility to check.
          </li>
        </ul>
      </Clause>

      <Clause n="5" title="Subject matter experts">
        <p>
          Experts publish under their own names and are not employees or agents of{' '}
          {LEGAL.entity}. Some may hold professional qualifications or registrations of their
          own; where an expert describes one, that description is theirs, and it does not
          extend to the platform.
        </p>
      </Clause>
    </LegalPage>
  )
}
