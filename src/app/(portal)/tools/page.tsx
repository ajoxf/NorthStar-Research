import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, LineChart } from 'lucide-react'

import { getCurrentMember, hasActiveSubscription } from '@/lib/auth'

export const metadata: Metadata = { title: 'Tools' }
export const dynamic = 'force-dynamic'

/**
 * Index of member analysis tools. Deliberately a list rather than a single hard-coded
 * page, so further tools drop in without restructuring navigation.
 */
const TOOLS = [
  {
    href: '/tools/withdrawal-planner',
    icon: LineChart,
    name: 'Systematic withdrawal planner',
    blurb:
      'Model how long a portfolio sustains inflation-indexed withdrawals, with the ending balance shown in real as well as nominal terms.',
  },
]

export default async function ToolsPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/tools')
  if (!hasActiveSubscription(member)) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-10 max-w-xl">
        <span className="eyebrow">Members</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Analysis tools</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-dim">
          Planning tools that run entirely in your browser. Nothing you enter is sent to us or
          stored anywhere.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="panel group flex flex-col p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45"
          >
            <tool.icon
              className="mb-4 h-5 w-5 text-ink-dim transition-colors group-hover:text-accent"
              aria-hidden
            />
            <h2 className="font-display text-xl leading-snug text-ink">{tool.name}</h2>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-dim">{tool.blurb}</p>
            <span className="mt-5 flex items-center gap-1 text-[13px] text-accent transition-transform group-hover:translate-x-0.5">
              Open
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
