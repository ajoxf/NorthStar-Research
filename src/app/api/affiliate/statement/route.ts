import { affiliateForMember } from '@/lib/affiliate-account'
import { affiliateStatement } from '@/lib/affiliate-report'
import { getCurrentMember } from '@/lib/auth'
import { centsToDecimal, csv, parsePeriod } from '@/lib/partner-report-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = {
  held: 'Held',
  payable: 'Payable',
  refunded: 'Refunded',
  reversed: 'Reversed',
  paid_out: 'Paid out',
  adjusted: 'Adjustment',
}

/**
 * The signed-in affiliate's statement as CSV, for the period they are looking at.
 *
 * The affiliate is the one linked to the signed-in member — never taken from the query —
 * and clients are masked exactly as on the page.
 */
export async function GET(request: Request) {
  const member = await getCurrentMember()
  if (!member) return new Response('You must be signed in.', { status: 401 })
  const affiliate = await affiliateForMember(member.id)
  if (!affiliate) return new Response('This account is not an affiliate.', { status: 403 })

  const days = parsePeriod(new URL(request.url).searchParams.get('days'), 90)
  const rows = await affiliateStatement(affiliate.id, days)

  const body = csv(
    ['date', 'type', 'order', 'items', 'client', 'campaign', 'sale_net', 'rate_pct', 'amount', 'currency', 'status', 'payable_on'],
    rows.map((row) => [
      row.at.toISOString().slice(0, 10),
      row.kind,
      row.orderNumber ? `NS-${row.orderNumber}` : '',
      row.items,
      row.client ?? '',
      row.campaign ?? '',
      row.saleCents === null ? '' : centsToDecimal(row.saleCents),
      row.ratePercent ?? '',
      centsToDecimal(row.amountCents),
      'USD',
      STATUS[row.status] ?? row.status,
      row.status === 'held' && row.payableAt ? row.payableAt.toISOString().slice(0, 10) : '',
    ]),
  )

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nordstar-commission-${days}d.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
