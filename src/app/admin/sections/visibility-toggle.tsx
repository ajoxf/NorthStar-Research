'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Show or hide the public sections surface.
 *
 * Visibility only. It does not change who can read a report — that is always decided the
 * same way, whether sections are on sale or not, because a switch that could open the
 * archive by accident is not a switch worth having.
 */
export function VisibilityToggle({ visible, ready }: { visible: boolean; ready: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)

  async function set(next: boolean) {
    if (
      next &&
      !window.confirm(
        'Show the contributors and coverage pages to the public?\n\n' +
          'Visitors will be able to browse sections and buy one. Members see no change either ' +
          'way — this does not alter who can read anything.',
      )
    ) {
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/admin/sections-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: next }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return
      }
      toast(next ? 'Sections are now public' : 'Sections are hidden again')
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3.5">
      {visible ? (
        <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      ) : (
        <EyeOff className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
      )}
      <p className="min-w-[240px] flex-1 text-[13px] leading-relaxed text-ink-dim">
        {visible ? (
          <>
            <span className="text-ink">The public can see sections.</span> /coverage and /experts
            are live, and visitors can buy a section.
          </>
        ) : (
          <>
            <span className="text-ink">Sections are hidden from the public.</span> /coverage and
            /experts return 404 and nothing links to them. Members see exactly the site they saw
            before.
          </>
        )}
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy || (!visible && !ready)}
        onClick={() => set(!visible)}
      >
        {busy && <Spinner />}
        {visible ? 'Hide from public' : 'Make public'}
      </Button>
    </div>
  )
}
