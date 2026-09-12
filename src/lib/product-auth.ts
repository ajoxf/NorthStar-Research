import 'server-only'

import { db } from '@/lib/db'
import { entitlementActive } from '@/lib/entitlements'
import {
  isAlreadyRegistered,
  isConfigured,
  normaliseEmail,
  syncAction,
  type SyncAction,
} from '@/lib/product-auth-shape'

/**
 * The calls out to a product's own auth system. The decisions are in product-auth-shape.ts.
 *
 * Only Nexus RAMP for now, which is Supabase. The env pair is named for the product
 * rather than for Supabase so a second product on a different stack needs a second
 * config rather than a rewrite — and when there are three of them, this becomes columns
 * on Item and this file stops naming any of them.
 */

export * from '@/lib/product-auth-shape'

const RAMP_ITEM_SLUG = process.env.RAMP_ITEM_SLUG?.trim() || 'nexus-ramp'

/*
 * Either key Supabase offers works here.
 *
 * `sb_secret_...` is the current one and the one to prefer: it rotates on its own without
 * touching the client key or signing anybody out, and it is refused outright if it ever
 * turns up in a browser. The legacy `service_role` JWT still works and does until the end
 * of 2026, so both names are read — a deployment that already has one keeps working, and
 * the name on the variable matches the key that is actually in it either way.
 *
 * Both are sent on the `apikey` and `Authorization` headers, which is what the gateway
 * expects: the new keys are not JWTs and would be rejected on `Authorization` alone.
 */
function config() {
  const url = process.env.RAMP_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key =
    process.env.RAMP_SUPABASE_SECRET_KEY?.trim() ||
    process.env.RAMP_SUPABASE_SERVICE_ROLE_KEY?.trim()
  return { url, key, ready: isConfigured(url, key) }
}

/** Whether the bridge can do anything at all. Surfaced in the admin console. */
export function productAuthConfigured(): boolean {
  return config().ready
}

export function productAuthItemSlug(): string {
  return RAMP_ITEM_SLUG
}

type AdminResponse = { ok: boolean; status: number; body: unknown }

async function adminFetch(path: string, init: RequestInit): Promise<AdminResponse> {
  const { url, key } = config()
  const response = await fetch(`${url}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: key as string,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, body }
}

/**
 * Find a user by email when we have no id for them.
 *
 * Only reached when the product's auth system says the email is already registered —
 * somebody who signed up for RAMP directly before the portal ever heard of them. The
 * admin API has no reliable lookup-by-email across versions, so this pages the list. At
 * the desk's scale that is one or two requests, and it happens once per such member,
 * ever: the id is stored afterwards.
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { ok, body } = await adminFetch(`/users?page=${page}&per_page=200`, { method: 'GET' })
    if (!ok) return null
    const users = (body as { users?: { id: string; email?: string }[] } | null)?.users ?? []
    const found = users.find((user) => normaliseEmail(user.email ?? '') === email)
    if (found) return found.id
    if (users.length < 200) return null
  }
  return null
}

export type SyncOutcome = {
  action: SyncAction | 'skipped'
  /** Why nothing happened, when nothing happened. */
  reason?: 'not_configured' | 'no_item' | 'failed'
  error?: string
}

/**
 * Bring a member's product account into line with what they actually hold.
 *
 * Safe to call from anywhere, as often as you like: it reads the entitlement, reads the
 * linked account, and does whatever the difference between them requires — including
 * nothing, which is the common case.
 *
 * **It never throws.** Every caller is in the middle of something that matters more:
 * granting a trial, redeeming a code, running the nightly job. A product's auth system
 * being briefly unreachable must not fail a redemption that has already been paid for —
 * the entitlement is the record of what somebody is owed, and the next call reconciles.
 * Failures are logged and returned, not raised.
 */
export async function syncProductAccess(
  memberId: string,
  options: { password?: string | null; itemSlug?: string } = {},
): Promise<SyncOutcome> {
  const { ready } = config()
  if (!ready) return { action: 'skipped', reason: 'not_configured' }

  const slug = options.itemSlug ?? RAMP_ITEM_SLUG

  try {
    const [item, member] = await Promise.all([
      db.item.findUnique({ where: { slug }, select: { id: true } }),
      db.member.findUnique({ where: { id: memberId }, select: { email: true } }),
    ])
    if (!item || !member) return { action: 'skipped', reason: 'no_item' }

    const [entitlement, account] = await Promise.all([
      db.entitlement.findFirst({
        where: { memberId, itemId: item.id },
        select: { status: true, renewsAt: true },
      }),
      db.productAccount.findUnique({
        where: { memberId_itemId: { memberId, itemId: item.id } },
        select: { externalId: true, disabledAt: true, adoptedAt: true },
      }),
    ])

    const holdsItem = entitlement ? entitlementActive(entitlement) : false
    const password = options.password?.trim() || null
    const action = syncAction({ holdsItem, account, password })
    if (action === 'none' || action === 'needs_password') return { action }

    const email = normaliseEmail(member.email)

    if (action === 'create') {
      const created = await adminFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          // Confirmed because this site has already established the address — the code
          // was emailed to it, or the trial signup used it. A second confirmation email
          // from a product they have not seen yet would read as spam.
          email_confirm: true,
        }),
      })

      let externalId = (created.body as { id?: string } | null)?.id ?? null
      let adopted = false

      if (!created.ok) {
        if (!isAlreadyRegistered(created.status, created.body)) {
          return fail(action, created)
        }
        // They already had an account there. Adopt it rather than reporting an error,
        // and do not touch its password: it is theirs, and they know it.
        externalId = await findUserIdByEmail(email)
        if (!externalId) return fail(action, created)
        adopted = true
      }

      if (!externalId) {
        // Created, or already there, but we cannot say which account it is — so there is
        // nothing to store and nothing to disable later. Report it rather than writing a
        // link that points nowhere.
        return fail(action, created)
      }

      await db.productAccount.create({
        data: { memberId, itemId: item.id, externalId, adoptedAt: adopted ? new Date() : null },
      })
      return { action: adopted ? 'adopted' : action }
    }

    if (!account) return { action: 'none' }

    if (action === 'reactivate') {
      const updated = await adminFetch(`/users/${account.externalId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ban_duration: 'none',
          ...(password ? { password } : {}),
        }),
      })
      if (!updated.ok) return fail(action, updated)
      await db.productAccount.update({
        where: { memberId_itemId: { memberId, itemId: item.id } },
        data: { disabledAt: null },
      })
      return { action }
    }

    if (action === 'set_password') {
      const updated = await adminFetch(`/users/${account.externalId}`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      })
      if (!updated.ok) return fail(action, updated)
      return { action }
    }

    // disable
    const banned = await adminFetch(`/users/${account.externalId}`, {
      method: 'PUT',
      // Long enough to mean "until somebody turns it back on". Their rows stay put.
      body: JSON.stringify({ ban_duration: '876000h' }),
    })
    if (!banned.ok) return fail(action, banned)
    await db.productAccount.update({
      where: { memberId_itemId: { memberId, itemId: item.id } },
      data: { disabledAt: new Date() },
    })
    return { action }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[product-auth] sync failed', { memberId, slug, message })
    return { action: 'skipped', reason: 'failed', error: message }
  }
}

function fail(action: SyncAction, response: AdminResponse): SyncOutcome {
  const message =
    (response.body as { msg?: string; message?: string } | null)?.msg ??
    (response.body as { message?: string } | null)?.message ??
    `HTTP ${response.status}`
  console.error('[product-auth] refused', { action, status: response.status, message })
  return { action: 'skipped', reason: 'failed', error: message }
}
