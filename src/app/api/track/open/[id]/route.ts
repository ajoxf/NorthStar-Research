import { NextResponse } from 'next/server'

import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 1x1 transparent GIF. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

/**
 * Email open tracking (build spec §5.6): flips a DeliveryLog to `opened` when the image
 * loads, feeding the "sent 3, opened 2" engagement view in the CRM.
 *
 * Worth being honest about the data quality: most mail clients now proxy or pre-fetch
 * images, so opens read high and misses read low. Treat it as a soft signal. The
 * authoritative engagement record is ReportView, which only fires on a real, authenticated
 * read of the report itself.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await db.deliveryLog.updateMany({
      where: { id: params.id, openedAt: null },
      data: { status: 'opened', openedAt: new Date() },
    })
  } catch (error) {
    // Never let tracking break the rendering of an email.
    console.error('[track] open pixel failed', error)
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  })
}
