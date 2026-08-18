import { DeliveryChart } from '@/components/charts/delivery-chart'
import { MemberGrowthChart } from '@/components/charts/member-growth-chart'
import { MemberSplitChart } from '@/components/charts/member-split-chart'
import { ReadRateChart } from '@/components/charts/read-rate-chart'
import { ReadsChart } from '@/components/charts/reads-chart'
import { ChartFrame } from '@/components/charts/chart-parts'
import { dashboardStats } from '@/lib/dashboard-stats'

/**
 * Five charts, each answering one question, in the order an operator asks them.
 *
 * Read rate leads, because it is the only one that can fall while every other number
 * rises. Then growth — is the business getting bigger. Then the membership split, reads
 * per edition, and finally what happened to each send, which is the diagnostic.
 *
 * Each is a different form because each has a different job, not for variety: a rate over
 * time is a line, a part-to-whole is a ring, magnitudes across nominal items are bars,
 * and mutually exclusive outcomes per send are a stack. Every one is drawn from records
 * the product already keeps — nothing here is sampled, smoothed or estimated — and the
 * tables below carry the same figures as text, which is the accessible view.
 */
export async function DashboardCharts() {
  const { weeks, reads, delivery, readRates, split } = await dashboardStats()

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
        Dashboard
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        {/*
          Half-width, like every chart here except the stacked send breakdown. Its
          viewBox is 560 and this column renders at roughly that, so a font size means
          what it says. Spanning both columns would scale the whole drawing up ~2x and
          render 10px labels at 20px — see the note in delivery-chart.tsx.
        */}
        <ChartFrame
          title="Read rate per edition"
          note="Readers as a share of everyone the edition reached. Pinned to 0–100%, so a small wobble is not drawn as a cliff."
        >
          <ReadRateChart points={readRates} />
        </ChartFrame>

        <ChartFrame
          title="Members"
          note="Cumulative, by week. Quiet weeks are drawn flat rather than skipped."
        >
          <MemberGrowthChart weeks={weeks} />
        </ChartFrame>

        <ChartFrame title="Membership" note="Mutually exclusive, and together the whole list.">
          <MemberSplitChart split={split} />
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
