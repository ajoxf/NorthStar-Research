import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { parseSegment, segmentWhere } from '@/lib/member-segments'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { whatsappNumberFor } from '@/lib/contact-numbers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * CSV export of the member list.
 *
 * This doubles as the ESP migration path (build spec §9): the columns map onto how Kit
 * and most ESPs model subscribers — email, first/last name, tags as a delimited string,
 * plus custom fields. Keep it complete and accurate rather than treating it as a debug
 * aid, because one day it will be how the list moves house.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  /*
   * The CSV must contain exactly what the screen showed.
   *
   * It previously honoured only `status`, so exporting from a filtered view — say
   * "never read" — silently produced a longer list than the one on screen. That list
   * then gets emailed, which makes it the kind of bug you find out about from a
   * recipient.
   */
  const url = new URL(request.url)
  const segment = parseSegment(Object.fromEntries(url.searchParams.entries()))

  const members = await db.member.findMany({
    where: segmentWhere(segment),
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { reportViews: true, deliveryLogs: true } },
    },
  })

  const columns = [
    'email',
    'first_name',
    'last_name',
    'phone_number',
    'whatsapp_number',
    // `whatsapp_opt_in` is now written again: it is true whenever a WhatsApp number is
    // known, on either line. `verified` remains unused — nothing verifies a number.
    'whatsapp_opt_in',
    'whatsapp_verified_legacy',
    'subscription_status',
    'subscription_started_at',
    'subscription_renews_at',
    'source',
    'tags',
    'admin_notes',
    'last_login_at',
    'last_report_viewed_at',
    'reports_viewed',
    'messages_sent',
    'created_at',
  ]

  const rows = members.map((member) =>
    [
      member.email,
      member.firstName ?? '',
      member.lastName ?? '',
      member.phoneNumber ?? '',
      whatsappNumberFor(member) ?? '',
      member.whatsappOptIn ? 'true' : 'false',
      member.whatsappVerified ? 'true' : 'false',
      member.subscriptionStatus,
      iso(member.subscriptionStartedAt),
      iso(member.subscriptionRenewsAt),
      member.source,
      // Comma-delimited inside one quoted field — the format Kit and Mailchimp expect.
      member.tags.join(', '),
      member.adminNotes ?? '',
      iso(member.lastLoginAt),
      iso(member.lastReportViewedAt),
      String(member._count.reportViews),
      String(member._count.deliveryLogs),
      iso(member.createdAt),
    ].map(csvCell),
  )

  const csv = [columns.join(','), ...rows.map((row) => row.join(','))].join('\r\n')
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nordstarpro-members-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

function iso(date: Date | null): string {
  return date ? date.toISOString() : ''
}

/** Quote every cell and double any embedded quotes — RFC 4180. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
