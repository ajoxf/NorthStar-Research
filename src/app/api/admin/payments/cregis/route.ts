import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { parseIpList } from '@/lib/cregis-callback'
import { CREGIS_SETTING_KEYS } from '@/lib/cregis-settings'
import { writeSetting } from '@/lib/secure-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Update the Cregis credentials from the console.
 *
 * Only Cregis. Stripe's key can move money out of the account and stays in the
 * environment; this one is deposit-only on this account, which is what makes editing it
 * an acceptable trade — see src/lib/secure-settings.ts.
 *
 * Every field is optional and independent. An omitted field is left alone; an empty
 * string deletes the stored value so the environment variable takes over again. That is
 * what makes this reversible: a mistake here is undone by clearing the field, not by a
 * redeploy.
 */
const schema = z.object({
  // Cregis project ids are numeric, and `pid` is sent to their API as a Number — a
  // non-numeric value would be silently coerced to NaN at checkout time.
  projectId: z
    .string()
    .trim()
    .regex(/^\d*$/, 'The project ID is the number shown in the Cregis Developer Center.')
    .max(64)
    .optional(),
  apiKey: z.string().trim().max(256).optional(),
  baseUrl: z
    .string()
    .trim()
    .max(256)
    .refine(
      (value) => value === '' || /^https:\/\/[^\s]+$/.test(value),
      'The base URL must start with https://',
    )
    .optional(),
  callbackIps: z.string().trim().max(2000).optional(),
})

export async function PATCH(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }

  const data = parsed.data

  if (data.callbackIps !== undefined && data.callbackIps !== '') {
    // Rejected here rather than at callback time, where a malformed entry would mean a
    // real payment silently refused.
    const bad = parseIpList(data.callbackIps).filter((entry) => !isIpAddress(entry))
    if (bad.length > 0) {
      return NextResponse.json(
        { error: `Not a valid IP address: ${bad.slice(0, 3).join(', ')}` },
        { status: 400 },
      )
    }
  }

  const writes: Promise<void>[] = []
  if (data.projectId !== undefined) {
    writes.push(writeSetting(CREGIS_SETTING_KEYS.projectId, data.projectId, admin.id))
  }
  if (data.apiKey !== undefined) {
    writes.push(writeSetting(CREGIS_SETTING_KEYS.apiKey, data.apiKey, admin.id))
  }
  if (data.baseUrl !== undefined) {
    writes.push(
      writeSetting(CREGIS_SETTING_KEYS.baseUrl, data.baseUrl.replace(/\/$/, ''), admin.id),
    )
  }
  if (data.callbackIps !== undefined) {
    writes.push(writeSetting(CREGIS_SETTING_KEYS.callbackIps, data.callbackIps, admin.id))
  }

  await Promise.all(writes)

  return NextResponse.json({ ok: true })
}

/** IPv4 or IPv6, without pulling in a dependency for four lines. */
function isIpAddress(value: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = value.match(ipv4)
  if (match) return match.slice(1).every((part) => Number(part) <= 255)
  return /^[0-9a-fA-F:]+$/.test(value) && value.includes(':')
}
