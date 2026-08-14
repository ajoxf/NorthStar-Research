import type { Metadata } from 'next'

import { CodeGenerator } from '@/app/admin/codes/code-generator'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { CODE_VALIDITY_DAYS, isCodeExpired } from '@/lib/codes'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Access codes', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Access codes in one place: the ones the payment callback minted, and the ones an
 * operator gifted. Gifted codes are exactly the rows with no Cregis order behind them.
 */
export default async function AdminCodesPage() {
  await requireAdmin()

  const codes = await db.redemptionCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { redeemedByMember: { select: { email: true } } },
  })

  const gifted = codes.filter((code) => !code.cregisOrderId)
  // "Live" is unused *and* still in date — an expired code is not stock on the shelf.
  const liveGifted = gifted.filter(
    (code) => code.status === 'unused' && !isCodeExpired(code),
  ).length
  const lapsed = codes.filter((code) => code.status === 'unused' && isCodeExpired(code)).length

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <span className="eyebrow">Gifted &amp; paid access</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Access codes</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
          {liveGifted} gifted code{liveGifted === 1 ? '' : 's'} still live
          {lapsed > 0 && ` · ${lapsed} expired unredeemed`}. Codes are valid for{' '}
          {CODE_VALIDITY_DAYS} days from the day they are issued.
        </p>
      </div>

      <CodeGenerator />

      <div className="panel mt-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="eyebrow px-4 py-3">Code</th>
              <th className="eyebrow px-4 py-3">Source</th>
              <th className="eyebrow px-4 py-3">Status</th>
              <th className="eyebrow px-4 py-3">Created</th>
              <th className="eyebrow px-4 py-3">Expires</th>
              <th className="eyebrow px-4 py-3">Redeemed by</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[15px] text-ink-dim">
                  No codes yet. Create some above, or they appear here automatically when
                  somebody pays.
                </td>
              </tr>
            ) : (
              codes.map((code) => (
                <tr key={code.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-[15px] text-ink">{code.code}</td>
                  <td className="px-4 py-3 text-[14px] text-ink-dim">
                    {code.cregisOrderId ? `Paid · ${code.email ?? ''}` : code.note || 'Gifted'}
                  </td>
                  <td className="px-4 py-3">
                    {code.status === 'redeemed' ? (
                      <Badge tone="muted">redeemed</Badge>
                    ) : isCodeExpired(code) ? (
                      <Badge tone="down">expired</Badge>
                    ) : (
                      <Badge tone="accent">unused</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">
                    {formatDate(code.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">
                    {code.expiresAt ? formatDate(code.expiresAt) : 'No expiry'}
                  </td>
                  {/* The address captured at redemption, falling back to the member
                      record. Both are written now; the column survives a member being
                      renamed or merged. */}
                  <td className="px-4 py-3 text-[14px] text-ink-dim">
                    {code.redeemedEmail ?? code.redeemedByMember?.email ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
