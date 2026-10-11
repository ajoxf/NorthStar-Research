import { getCurrentMember } from '@/lib/auth'
import { authorForMember, expertStatement } from '@/lib/expert-account'
import { summariseByPeriod, totalsByProduct } from '@/lib/expert-statement'
import { centsToDecimal, csv } from '@/lib/partner-report-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The signed-in expert's sales as CSV: the same totals as their page — 24 months, 12
 * weeks, and each product all time. Totals only, never a row per payment: on a small
 * section a dated amount is enough to recognise a buyer.
 *
 * The expert is the one linked to the signed-in member — never taken from the query.
 */
export async function GET() {
  const member = await getCurrentMember()
  if (!member) return new Response('You must be signed in.', { status: 401 })
  const author = await authorForMember(member.id)
  if (!author) return new Response('This account is not a subject matter expert.', { status: 403 })

  const statement = await expertStatement(author.id)
  const day = (date: Date) => date.toISOString().slice(0, 10)
  const money = (cents: number) => centsToDecimal(cents)

  const periodRows = (unit: 'month' | 'week', count: number) =>
    summariseByPeriod(statement.entries, unit, count).map((period) => [
      unit,
      day(period.start),
      '',
      period.payments,
      money(period.grossCents),
      money(period.deductionsCents),
      money(period.netCents),
      money(period.shareCents),
      money(period.takenBackCents),
      'USD',
    ])
  const productRows = totalsByProduct(statement.entries).map((product) => [
    'product',
    '',
    statement.names.get(product.key) ?? 'Retired product',
    product.payments,
    '',
    '',
    '',
    money(product.shareCents),
    money(product.takenBackCents),
    'USD',
  ])

  const body = csv(
    ['period', 'start', 'product', 'payments', 'gross', 'deductions', 'net', 'your_share', 'taken_back', 'currency'],
    [...periodRows('month', 24), ...periodRows('week', 12), ...productRows],
  )

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nordstar-expert-statement-${day(new Date())}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
