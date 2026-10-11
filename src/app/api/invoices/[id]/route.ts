import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceFigures } from '@/lib/invoice-shape'
import { paymentReference } from '@/lib/payments/gateways/custom'
import { formatRate } from '@/lib/tax-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function money(cents: number, currency: string): string {
  return `${currency === 'USD' ? '$' : ''}${(cents / 100).toFixed(2)}${currency === 'USD' ? '' : ` ${currency}`}`
}

function countryName(code: string | null): string {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * A printable tax invoice for one paid order — "Print / Save PDF" in the browser.
 *
 * Printed from the order as sold: its rate, its tax and its totals, never today's. The
 * buyer opens their own; admins open any. Anybody else is told it does not exist, so an
 * order id cannot be used to learn whose it is.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) {
    const next = encodeURIComponent(new URL(request.url).pathname)
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url))
  }

  const order = await db.checkoutOrder.findUnique({
    where: { id: params.id },
    include: {
      lines: { orderBy: { position: 'asc' }, select: { name: true, chargeCents: true } },
      refunds: { select: { amountCents: true } },
      section: { select: { displayName: true } },
      package: { select: { name: true } },
    },
  })
  const allowed = order && (member.role === 'admin' || member.email === order.email)
  if (!order || !allowed || order.status !== 'paid' || order.isTest) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const buyer = await db.member.findUnique({ where: { email: order.email }, select: { firstName: true, lastName: true } })
  const totalCents = order.grossCents ?? Math.round(Number(order.amount) * 100)
  const figures = invoiceFigures({
    number: order.number,
    currency: order.currency,
    totalCents,
    taxCents: order.taxCents ?? 0,
    taxRate: Number(order.taxRate),
    taxName: order.taxName,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    reverseCharge: order.reverseCharge,
    billingCountry: order.billingCountry,
    refundedCents: order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0),
    lines: order.lines.length
      ? order.lines
      : [{ name: order.package?.name ?? order.section?.displayName ?? 'NordStar Pro membership', chargeCents: totalCents }],
  })

  const currency = order.currency
  const m = (cents: number) => esc(money(cents, currency))
  const rate = Number(order.taxRate)
  const pct = rate ? formatRate(rate) : '0%'
  const taxShort = (order.taxName?.split(' ').pop() ?? 'VAT').toUpperCase()
  const seller = process.env.COMPANY_LEGAL_NAME?.trim() || 'NordStar Pro'
  const address = process.env.COMPANY_ADDRESS?.trim() ?? ''
  const trn = process.env.COMPANY_TRN?.trim() ?? ''
  const title = trn ? 'Tax Invoice' : 'Invoice'
  const reference = paymentReference(order.number)
  const issued = (order.paidAt ?? order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ')

  const rows = figures.lines
    .map(
      (line) => `<tr><td>${esc(line.name)}</td><td class="r">1</td><td class="r">${m(line.taxableCents)}</td>
      <td class="r">${order.reverseCharge ? '0%' : esc(pct)}</td><td class="r">${m(line.taxCents)}</td><td class="r">${m(line.totalCents)}</td></tr>`,
    )
    .join('')

  const totalRow = (label: string, value: string, strong = false) =>
    `<div class="t${strong ? ' strong' : ''}"><span>${label}</span><span>${value}</span></div>`

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} ${esc(reference)} | NordStar Pro</title>
<style>
:root{--ink:#0b0d10;--muted:#5b6270;--lime:#d6fd3a;--grey:#f3f4f6;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;background:var(--grey);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:820px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden}
.top{background:#000;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.brand{font-size:22px;letter-spacing:-.02em}.brand small{color:var(--lime);font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;margin-left:6px}
.pill{display:inline-block;border-radius:999px;padding:4px 14px;font:500 12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase}
.pill.paid{background:var(--lime);color:var(--ink)}.pill.refund{border:1px solid #f0b429;color:#f0b429}
.body{padding:32px}
h1{font-weight:500;letter-spacing:-.03em;font-size:34px;line-height:1.1;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:6px 28px;margin-top:12px;color:var(--muted)}.meta b{color:var(--ink);font-weight:500}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px}
.box{background:var(--grey);border-radius:12px;padding:18px}.box p{margin:0}
.label{font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;margin:0 0 10px}
.scroll{overflow-x:auto;margin-top:28px}
table{width:100%;min-width:560px;border-collapse:collapse}
th{font:500 11px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:0 0 10px;border-bottom:1px solid var(--ink)}
td{padding:12px 0;border-bottom:1px solid var(--line);vertical-align:top}
.r{text-align:right;padding-left:14px}
.totals{margin-left:auto;width:min(100%,380px);margin-top:20px}
.t{display:flex;justify-content:space-between;gap:16px;padding:6px 0;color:var(--muted)}.t span:last-child{color:var(--ink);font-family:ui-monospace,Menlo,monospace}
.t.strong{border-top:1px solid var(--ink);margin-top:6px;padding-top:10px;color:var(--ink);font-weight:500}
.note{margin-top:24px;padding:14px 16px;border-radius:12px;background:var(--grey);font-size:14px}
.foot{margin-top:28px;color:var(--muted);font-size:13px}
.actions{max-width:820px;margin:16px auto 0;display:flex;justify-content:flex-end;padding:0 16px}
button{border:0;border-radius:999px;background:var(--lime);color:var(--ink);font:600 15px/1 inherit;padding:12px 22px;cursor:pointer}
@media (max-width:640px){.page{margin:12px;border-radius:12px}.body{padding:20px}.parties{grid-template-columns:1fr}h1{font-size:28px}}
@media print{body{background:#fff}.page{margin:0;border-radius:0}.actions{display:none}}
</style></head><body>
<div class="actions"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
<div class="page">
  <div class="top"><div class="brand">NordStar<small>PRO</small></div>
    <span class="pill ${figures.status === 'Paid' ? 'paid' : 'refund'}">${esc(figures.status)}</span></div>
  <div class="body">
    <h1>${title}</h1>
    <div class="meta"><span>Invoice <b>${esc(reference)}</b></span><span>Issued <b>${esc(issued)}</b></span><span>Currency <b>${esc(currency)}</b></span></div>
    <div class="parties">
      <div class="box"><p class="label">From</p><p><b>${esc(seller)}</b></p>${address ? `<p>${esc(address).replace(/\n/g, '<br>')}</p>` : ''}${trn ? `<p>TRN ${esc(trn)}</p>` : ''}</div>
      <div class="box"><p class="label">Billed to</p>${buyerName ? `<p><b>${esc(buyerName)}</b></p>` : ''}${order.billingCompany ? `<p>${esc(order.billingCompany)}</p>` : ''}<p>${esc(order.email)}</p>${order.billingCountry ? `<p>${esc(countryName(order.billingCountry))}</p>` : ''}${order.billingTaxId ? `<p>VAT/GST no. ${esc(order.billingTaxId)}</p>` : ''}</div>
    </div>
    <div class="scroll"><table>
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Taxable amount</th><th class="r">${esc(taxShort)} %</th><th class="r">${esc(taxShort)}</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="totals">
      ${totalRow('Subtotal', m(figures.subtotalCents))}
      ${figures.discountCents ? totalRow('Discount', `−${m(figures.discountCents)}`) : ''}
      ${order.reverseCharge ? totalRow(`${esc(taxShort)} not charged (reverse charge)`, `−${m(figures.reverseChargedCents)}`) : ''}
      ${totalRow('Taxable amount', m(figures.taxableCents))}
      ${order.taxName ? totalRow(`${esc(order.taxName)} ${esc(pct)}`, m(figures.taxCents)) : ''}
      ${figures.aed ? totalRow(`VAT in AED (1 ${esc(currency)} = ${figures.aed.rate} AED)`, `AED ${(figures.aed.vatAed / 100).toFixed(2)}`) : ''}
      ${totalRow('Total', m(figures.totalCents), true)}
      ${totalRow('Amount paid', m(figures.totalCents))}
      ${figures.refundedCents ? totalRow('Refunded', `−${m(figures.refundedCents)}`) : ''}
    </div>
    ${order.reverseCharge ? '<p class="note">Reverse charge: VAT is not charged on this supply. The customer is responsible for accounting for VAT in their country.</p>' : ''}
    <p class="foot">Prices include tax where applicable. Questions about this invoice: reply to your receipt email, quoting ${esc(reference)}.</p>
  </div>
</div></body></html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}
