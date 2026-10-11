import 'server-only'

import type { Prisma } from '@prisma/client'

import { db } from '@/lib/db'

/**
 * Write down what an admin did to money settings or an order.
 *
 * `details` names fields and carries what an admin typed as a reference — never a key or
 * secret value. Never throws: a missing audit table must not stop an admin saving keys or
 * confirming a payment, so a failure is logged instead.
 */
export async function recordAudit(
  actorId: string | null,
  action: string,
  target: string | null,
  details?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await db.adminAuditLog.create({ data: { actorId, action, target, details } })
  } catch (error) {
    console.error(`[audit] could not record ${action} on ${target ?? '—'}`, error)
  }
}
