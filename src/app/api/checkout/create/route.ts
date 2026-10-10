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
  return checkout(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, provider: 'cregis' }),
    }),
  )
}
