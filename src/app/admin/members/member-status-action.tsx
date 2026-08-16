'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

import { Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Activate a member from the list, without opening their record.
 *
 * The full status dropdown lives on the member's own page; this is the one transition an
 * operator makes repeatedly — comping a reader, or fixing an account whose payment
 * callback never landed — and walking into a detail page for each is friction that leads
 * to it not being done.
 *
 * Only ever activates. Deactivating is a heavier decision that removes someone's paid
 * access, and it stays on the detail page where the rest of their history is visible.
 */
export function ActivateMemberButton({ memberId, email }: { memberId: string; email: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)

  async function activate() {
    if (
      !window.confirm(
        `Give ${email} full member access?\n\n` +
          'They will be able to read every report, and will receive future ones by email.',
      )
    ) {
      return
    }

    setPending(true)
    try {
      const response = await fetch(`/api/admin/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionStatus: 'active' }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        toast(data?.error ?? `Could not activate (HTTP ${response.status}).`, 'error')
        return
      }

      toast(`${email} is now an active member`, 'success')
      router.refresh()
    } catch {
      toast('Could not activate. Check your connection and try again.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={activate}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:border-up/50 hover:text-up disabled:opacity-50"
    >
      {pending ? <Spinner /> : <Check className="h-3 w-3" aria-hidden />}
      Activate
    </button>
  )
}
