import { DisclaimerText } from '@/components/disclaimer'
import { Clause, LegalPage, ReviewNote, legalMetadata } from '@/components/legal-page'
import { AGGREGATOR_STATEMENT } from '@/lib/legal'

export const metadata = legalMetadata('Risk Disclaimer')

/**
 * The Risk Disclaimer.
 *
 * The verbatim disclaimer text (DisclaimerText) stays exactly as specified and is shown
 * whole in section 2; the sections around it add the aggregator positioning and the risks
 * specific to what the platform covers. They add to it and never restate it differently.
 */
export default function DisclaimerPage() {
  return (
    <LegalPage title="Risk Disclaimer" intro={<p>{AGGREGATOR_STATEMENT}</p>}>
      <Clause n="1" title="What the platform is">
        <p>
          The platform publishes research by independent subject matter experts. Each section is
          written by one named expert, and the views in it are that expert&apos;s alone. The
          platform does not write the research, does not check whether a view is correct, and
          does not endorse any of it.
        </p>
        <p>
          Nothing on the platform is a personal recommendation. It is not prepared for you,
          does not take account of your circumstances, and is no substitute for advice from an
          adviser authorised where you live.
        </p>
      </Clause>

      <Clause n="2" title="Disclaimer">
        <DisclaimerText className="space-y-4" />
        <ReviewNote>
          This text was specified to appear verbatim and is also printed in full in the site
          footer. Parts of it describe &quot;our professional analysts&quot; and &quot;NordStar
          Pro, its employees, and associates&quot;, which reads as if the platform employs the
          people who write the research. That sits uneasily with the aggregator positioning in
          section 1. It should be reconciled in review rather than edited here.
        </ReviewNote>
      </Clause>

      <Clause n="3" title="Risks of the markets covered">
        <ul>
          <li>
            <strong>You can lose money,</strong> including all of it. Prices move against
            positions, sometimes quickly and without warning.
          </li>
          <li>
            <strong>Leverage multiplies losses as well as gains.</strong> With margin trading,
            CFDs, futures and options, you can lose more than you put in.
          </li>
          <li>
            <strong>Foreign exchange and commodities</strong> are affected by interest rates,
            politics, supply shocks and events outside any analyst&apos;s view, and can gap
            across levels a setup depends on.
          </li>
          <li>
            <strong>Crypto-assets</strong> are highly volatile, are largely unregulated in many
            countries, trade around the clock, and can become illiquid or worthless. Paying
            for a subscription in crypto does not change any of this.
          </li>
          <li>
            <strong>AI-assisted analysis</strong> can be wrong in ways that look confident. A
            model&apos;s output is a view like any other, not a measurement.
          </li>
          <li>
            <strong>Research ages.</strong> A level, setup or position described on one date may
            no longer be valid by the time you read it.
          </li>
        </ul>
      </Clause>

      <Clause n="4" title="Performance">
        <p>
          Past performance, whether real or simulated, is not a reliable guide to future
          results. Any track record an expert describes is their own account of it and has not
          been verified by the platform. The platform makes no claim about the returns anybody
          has made, or could make, from following research published here.
        </p>
      </Clause>
    </LegalPage>
  )
}
