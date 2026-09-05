'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Eye, EyeOff } from 'lucide-react'

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
        'Show sections to the public?\n\n' +
          'The contributors and coverage pages go live, and the homepage starts showing your ' +
          'topics and experts. Visitors will be able to buy a section.\n\n' +
          'Members see no change either way — this does not alter who can read anything.',
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
            are live, the homepage shows your topics and contributors, and visitors can buy a
            section.
          </>
        ) : (
          <>
            <span className="text-ink">Sections are hidden from the public.</span> /coverage and
            /experts return 404 for visitors, the homepage is unchanged, and nothing links to
            them. Preview them yourself with the buttons here — as an admin you see them either
            way.
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/*
          The preview links live here rather than in a menu, because "what will this look
          like" is the question somebody has at the exact moment they are deciding whether
          to press the button next to them. As an admin these open normally whether the
          surface is public or not; for everyone else they are a 404 until it is.
        */}
        <Link
          href="/coverage"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[12px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          Preview coverage
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
        <Link
          href="/experts"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[12px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          Preview contributors
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
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
    </div>
  )
}
