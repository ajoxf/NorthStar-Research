import { DeliveryChart } from '@/components/charts/delivery-chart'
import { MemberGrowthChart } from '@/components/charts/member-growth-chart'
import { ReadsChart } from '@/components/charts/reads-chart'
import { ChartFrame } from '@/components/charts/chart-parts'
import { dashboardStats } from '@/lib/dashboard-stats'

/**
 * Three charts, each answering one question, in the order an operator asks them.
 *
 * Growth first — is the business getting bigger. Then reads per edition — is the work
 * being consumed. Then what happened to each send — is anything broken.
 *
 * Deliberately not a wall of gauges. Every chart here is drawn from records the product
 * already keeps, and the tables in the engagement panel below carry the same figures as
 * text, which is the accessible view and the one to copy numbers out of.
 */
export async function DashboardCharts() {
  const { weeks, reads, delivery } = await dashboardStats()

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
        Dashboard
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Members"
          note="Cumulative, by week. Quiet weeks are drawn flat rather than skipped."
        >
          <MemberGrowthChart weeks={weeks} />
        </ChartFrame>

        <ChartFrame
          title="Reads per report"
          note="Distinct members who opened each edition in the portal."
        >
          <ReadsChart reports={reads} />
        </ChartFrame>

        <div className="lg:col-span-2">
          <ChartFrame
            title="What happened to each send"
            note="Every recipient appears once. Read implies delivered, so the segments do not double-count."
          >
            <DeliveryChart reports={delivery} />
          </ChartFrame>
        </div>
      </div>
    </section>
  )
}
