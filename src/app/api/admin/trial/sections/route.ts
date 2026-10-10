import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { openTrialOnEverySection, setNewSectionsOpenTrial } from '@/lib/trial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function admin() {
  try {
    return { admin: await requireAdmin() }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { response: NextResponse.json({ error: error.message }, { status: 403 }) }
    }
    throw error
  }
}

/** Whether sections created from now on start with their trial open. Moves nothing existing. */
export async function PATCH(request: Request) {
  const gate = await admin()
  if ('response' in gate) return gate.response

  const parsed = z
    .object({ newSectionsOpen: z.boolean() })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  await setNewSectionsOpenTrial(parsed.data.newSectionsOpen, gate.admin.id)
  return NextResponse.json({ ok: true, newSectionsOpen: parsed.data.newSectionsOpen })
}

/**
 * Open the trial on every section on the shelf.
 *
 * Its own act, behind its own button and a confirmation, rather than a side effect of the
 * default above: starting to give away every existing product for free is a decision, and
 * it should be one somebody made on purpose. Closing them again is per section.
 */
export async function POST() {
  const gate = await admin()
  if ('response' in gate) return gate.response

  const opened = await openTrialOnEverySection()
  return NextResponse.json({ ok: true, opened })
}
