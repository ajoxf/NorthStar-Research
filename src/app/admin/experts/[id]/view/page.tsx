import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Eye } from 'lucide-react'

import { ExpertDashboard, RANGES } from '@/app/(portal)/expert/expert-dashboard'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { parsePeriod, type Period as Range } from '@/lib/partner-report-shape'

export const metadata: Metadata = { title: 'View as expert', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * An expert's page as they see it, for an admin — read-only. Nothing here signs in as the
 * expert or acts for them: the forms, uploads, withdrawals and downloads that would act as
 * the expert are left out, so looking can never change their account or move their money.
 */
export default async function ViewAsExpertPage({
  params,
  searchParams = {},
}: {
  params: { id: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  await requireAdmin()
  const author = await db.author.findUnique({ where: { id: params.id } })
  if (!author) notFound()

  const asked = parsePeriod(searchParams.range, 90)
  const range: Range = (RANGES as readonly number[]).includes(asked) ? asked : 90

  return (
    <ToastProvider>
      <div className="sticky top-0 z-30 border-b border-accent/40 bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <span className="flex items-center gap-2 text-[14px] text-ink">
            <Eye className="h-4 w-4 text-accent-ink" aria-hidden />
            Viewing as {author.name} — read only. Nothing here can be changed or sent.
          </span>
          <Link href="/admin/experts" className="inline-flex items-center gap-1.5 text-[14px] text-ink-dim hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Experts
          </Link>
        </div>
      </div>
      <ExpertDashboard author={author} range={range} readOnly basePath={`/admin/experts/${author.id}/view`} />
    </ToastProvider>
  )
}
