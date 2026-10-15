import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { ExpertDashboard, RANGES } from '@/app/(portal)/expert/expert-dashboard'
import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { parsePeriod, type Period as Range } from '@/lib/partner-report-shape'

export const metadata: Metadata = { title: 'Expert', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** The signed-in subject matter expert's own page. The content is ExpertDashboard. */
export default async function ExpertPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/expert')
  const author = await authorForMember(member.id)
  if (!author) notFound()

  const asked = parsePeriod(searchParams.range, 90)
  const range: Range = (RANGES as readonly number[]).includes(asked) ? asked : 90
  return <ExpertDashboard author={author} range={range} />
}
