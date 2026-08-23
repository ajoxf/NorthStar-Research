'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Whether the site shows its price or asks people to enquire.
 *
 * A setting rather than a deploy, because this is a commercial posture that moves back
 * and forth. Switching to request-only takes every figure off the public pages and turns
 * the join page into a form; switching back restores all of it. Neither changes the
 * price, and neither touches checkout — somebody holding a private link pays the same
 * amount either way.
 */
export function PricingModeForm({ mode }: { mode: 'public' | 'enquiry' }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState<string | null>(null)

  async function choose(next: 'public' | 'enquiry') {
    if (next === mode) return
    setPending(next)
    try {
      const response = await fetch('/api/admin/pricing-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? 'Could not change that.', 'error')
        return
      }
      toast(next === 'public' ? 'The price is now public' : 'The price is now on request', 'success')
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Option
          active={mode === 'enquiry'}
          pending={pending === 'enquiry'}
          title="On request"
          body="No figure anywhere public. The join page takes an enquiry, and you send pricing and a payment link from Enquiries."
          onSelect={() => choose('enquiry')}
        />
        <Option
          active={mode === 'public'}
          pending={pending === 'public'}
          title="Shown publicly"
          body="The price appears on the homepage, the header, the FAQs and the join page, and anyone can buy without asking first."
          onSelect={() => choose('public')}
        />
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
        This changes what the site shows, never what anybody is charged. A buyer holding a private
        pricing link sees the real figure and the real checkout in either mode.
      </p>
    </div>
  )
}

function Option({
  active,
  pending,
  title,
  body,
  onSelect,
}: {
  active: boolean
  pending: boolean
  title: string
  body: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-lg border p-4 text-left transition-colors ${
        active ? 'border-accent/60 bg-accent/10' : 'border-line bg-panel-2 hover:border-ink-dim/40'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-[14px] text-ink">{title}</span>
        {pending && <Spinner />}
        {active && !pending && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">now</span>
        )}
      </span>
      <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-dim">{body}</span>
    </button>
  )
}

