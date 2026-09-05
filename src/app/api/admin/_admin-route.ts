import { NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'

/**
 * The guard-and-parse preamble every admin write route repeats.
 *
 * Factored out because it was six identical try/catch blocks, and an admin route that
 * forgets the guard looks exactly like one that has it until somebody tries it logged out.
 * Returning a `NextResponse` on failure lets each handler start with one early return.
 */
export async function adminInput<T>(
  request: Request,
  schema: ZodSchema<T>,
  fallbackError = 'Check the values you entered.',
): Promise<{ data: T } | { response: NextResponse }> {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { response: NextResponse.json({ error: error.message }, { status: 403 }) }
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? fallbackError },
        { status: 400 },
      ),
    }
  }
  return { data: parsed.data }
}

/** Guard only, for routes that take no body. */
export async function adminOnly(): Promise<NextResponse | null> {
  try {
    await requireAdmin()
    return null
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }
}
