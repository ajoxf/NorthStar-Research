'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { formatPrice } from '@/lib/package-shape'
import { PAYOUT_LABELS, nextStatuses, type PayoutStatusValue } from '@/lib/payout-flow'

export type PayoutRow = {
  id: string
  authorName: string
  amountCents: number
  currency: string
  status: PayoutStatusValue
  destination: string | null
  note: string | null
  rejectedReason: string | null
  externalReference: string | null
  requestedByEmail: string | null
  approvedByEmail: string | null
  requestedAt: string
  approvedAt: string | null
  sentAt: string | null
  /** One person did both halves. Allowed, never silent — see payout-flow.ts. */
  selfApproved: boolean
}

const TONE: Record<PayoutStatusValue, 'accent' | 'neutral' | 'muted' | 'up' | 'down'> = {
  requested: 'accent',
  approved: 'neutral',
  sent: 'neutral',
  settled: 'up',
  rejected: 'muted',
  failed: 'down',
}

/** What each move is called on the button that makes it. */
const ACTION_LABEL: Record<PayoutStatusValue, string> = {
  approved: 'Approve',
  rejected: 'Reject',
  sent: 'Mark sent',
  settled: 'Mark settled',
  failed: 'Mark failed',
  requested: 'Reopen',
}

/**
 * The approval queue.
 *
 * **The buttons come from the transition table, not from this file.** `nextStatuses` is
 * what decides which moves a withdrawal can make, and the route asks it too — so the screen
 * cannot offer something the API would refuse, and cannot be edited into offering a step
 * the API would allow.
 */
export function WithdrawalQueue({ payouts }: { payouts: PayoutRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [reference, setReference] = React.useState<Record<string, string>>({})

  async function move(payout: PayoutRow, to: PayoutStatusValue) {
    if (to === 'rejected' || to === 'failed') {
      const reason = window.prompt(
        to === 'rejected'
          ? 'Why is this being rejected? The contributor will be told.'
          : 'What went wrong? The balance is restored if it had already been sent.',
      )
      if (!reason?.trim()) return
      await send(payout.id, { to, reason: reason.trim() })
      return
    }

    if (to === 'sent') {
      const confirmed = window.confirm(
        `Mark ${formatPrice(payout.amountCents, payout.currency)} to ${payout.authorName} as sent?\n\n` +
          'This records that the money has left and takes it off their balance. It does not ' +
          'send anything — do the transfer first.',
      )
      if (!confirmed) return
    }

    await send(payout.id, { to, externalReference: reference[payout.id] || undefined })
  }

  async function send(id: string, body: unknown) {
    setBusy(id)
    try {
      const response = await fetch(`/api/admin/payouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast(data.error ?? 'That did not work.', 'error')
        return
      }
      toast('Withdrawal updated', 'success')
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (payouts.length === 0) {
    return <p className="text-[16px] text-ink-dim">No withdrawals yet.</p>
  }

  return (
    <ul className="divide-y divide-line border-t border-line">
      {payouts.map((payout) => {
        const moves = nextStatuses(payout.status)
        return (
          <li key={payout.id} className="py-4">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-[280px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] text-ink">{payout.authorName}</span>
                  <span className="font-mono text-[16px] text-ink">
                    {formatPrice(payout.amountCents, payout.currency)}
                  </span>
                  <Badge tone={TONE[payout.status]}>{PAYOUT_LABELS[payout.status]}</Badge>
                  {/*
                    Never silent. The difference between "two people saw this" and "one
                    person did both" would otherwise be buried in two id columns nobody
                    compares.
                  */}
                  {payout.selfApproved && <Badge tone="down">self-approved</Badge>}
                </div>
                <p className="mt-1 font-mono text-[12px] leading-relaxed text-ink-dim">
                  requested {payout.requestedAt.slice(0, 10)}
                  {payout.requestedByEmail && ` by ${payout.requestedByEmail}`}
                  {payout.approvedAt &&
                    ` · approved ${payout.approvedAt.slice(0, 10)}${
                      payout.approvedByEmail ? ` by ${payout.approvedByEmail}` : ''
                    }`}
                  {payout.sentAt && ` · sent ${payout.sentAt.slice(0, 10)}`}
                </p>
                {payout.destination && (
                  <p className="mt-1 break-all font-mono text-[12px] text-ink-dim">
                    to {payout.destination}
                  </p>
                )}
                {payout.externalReference && (
                  <p className="mt-1 break-all font-mono text-[12px] text-ink-dim">
                    ref {payout.externalReference}
                  </p>
                )}
                {payout.rejectedReason && (
                  <p className="mt-1 text-[15px] text-ink-dim">{payout.rejectedReason}</p>
                )}
                {payout.note && <p className="mt-1 text-[15px] text-ink-dim">{payout.note}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* The reference is captured at the moment of sending, where it is known. */}
                {payout.status === 'approved' && (
                  <Input
                    className="h-9 w-[180px] text-[14px]"
                    placeholder="Transaction ref"
                    aria-label="Transaction reference"
                    value={reference[payout.id] ?? ''}
                    onChange={(event) =>
                      setReference({ ...reference, [payout.id]: event.target.value })
                    }
                  />
                )}
                {moves.map((to) => (
                  <Button
                    key={to}
                    size="sm"
                    variant={to === 'rejected' || to === 'failed' ? 'danger' : 'secondary'}
                    disabled={busy === payout.id}
                    onClick={() => void move(payout, to)}
                  >
                    {busy === payout.id && <Spinner />}
                    {ACTION_LABEL[to]}
                  </Button>
                ))}
                {moves.length === 0 && (
                  <span className="font-mono text-[12px] text-ink-dim">nothing left to do</span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
