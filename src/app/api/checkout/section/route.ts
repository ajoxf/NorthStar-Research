import { POST as checkout } from '@/app/api/checkout/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Superseded by /api/checkout, which takes any item and any rail.
 *
 * Kept for one release so a checkout page loaded before the deploy still works after it.
 * Delete once nothing has called it for a while.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  // This route only ever sold sections; without one it must not fall through to a package.
  if (!body?.sectionId) {
    return Response.json({ error: 'That section is not on sale. Nothing has been charged.' }, { status: 404 })
  }
  return checkout(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, method: body?.method ?? 'card' }),
    }),
  )
}
