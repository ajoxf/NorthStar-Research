'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { DEFAULT_SHARE_PERCENT } from '@/lib/earnings'
import { formatPrice, parsePriceCents } from '@/lib/package-shape'

export type LedgerRow = {
  id: string
  kind: string
  amountCents: number
  currency: string
  payableAt: string | null
  sharePercent: number | null
  basisCents: number | null
  note: string | null
  createdAt: string
  /** When the money actually moved. See the note where this is built. */
  occurredAt: string
  orderId: string | null
  /** What is left to refund on the order behind this entry. Null when there is no order. */
  orderRefundableCents: number | null
  /** The contributor this entry belongs to; a refund recorded from it covers their part only. */
  authorId?: string
}

export type AuthorEarnings = {
  id: string
  name: string
  slug: string
  revenueSharePercent: number | null
  totalCents: number
  availableCents: number
  heldCents: number
  currency: string
  entries: LedgerRow[]
}

const KIND_LABEL: Record<string, string> = {
  earning: 'Earned',
  reversal: 'Refunded',
  adjustment: 'Adjustment',
  payout: 'Paid out',
}

/**
 * Contributor balances, their ledger, and the three things an operator does to one.
 *
 * One screen rather than a list and a detail page: there are a handful of contributors,
 * the ledger is the whole point, and a drill-down that costs a page load is one nobody
 * opens. The approval queue is its own page, because a different person does that job.
 */
export function EarningsManager({ authors }: { authors: AuthorEarnings[] }) {
  return (
    <div className="space-y-4">
      {authors.length === 0 ? (
        <p className="text-[16px] text-ink-dim">No contributors yet.</p>
      ) : (
        authors.map((author) => <AuthorCard key={author.id} author={author} />)
      )}
    </div>
  )
}

function AuthorCard({ author }: { author: AuthorEarnings }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function send(url: string, method: string, body: unknown, success: string) {
    setBusy(true)
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast(data.error ?? 'That did not work.', 'error')
        return false
      }
      toast(success, 'success')
      // A refund that completed part of an order also takes back the access it paid for.
      // Said either way, and loudly when something is left to do by hand in Stripe.
      if (data.access?.note) toast(data.access.note, 'error')
      else if (data.access?.ended > 0) {
        toast(
          `Access taken back on ${data.access.ended} item${data.access.ended === 1 ? '' : 's'}` +
            (data.access.renewal === 'cancelled'
              ? ' and the card subscription cancelled'
              : data.access.renewal === 'removed'
                ? ' and removed from the card subscription'
                : ''),
          'info',
        )
      }
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  const share = author.revenueSharePercent ?? DEFAULT_SHARE_PERCENT
  const usingDefault = author.revenueSharePercent === null

  return (
    <section className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[20px] text-ink">{author.name}</h2>
            <Badge tone={usingDefault ? 'muted' : 'neutral'}>
              {share}% share{usingDefault ? ' (house default)' : ''}
            </Badge>
          </div>
          <p className="mt-2 font-mono text-[14px] text-ink-dim">
            {/*
              Three figures, not one. "Balance" alone is the number somebody tries to
              withdraw and cannot — the holdback is the difference and has to be visible.
            */}
            earned {formatPrice(author.totalCents, author.currency)} · available{' '}
            <span className="text-ink">{formatPrice(author.availableCents, author.currency)}</span>{' '}
            · held {formatPrice(author.heldCents, author.currency)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
          {open ? 'Hide' : 'Open'} ledger
        </Button>
      </div>

      {open && (
        <div className="mt-6 space-y-6">
          <ShareEditor author={author} busy={busy} send={send} />
          <WithdrawalForm author={author} busy={busy} send={send} />
          <AdjustmentForm author={author} busy={busy} send={send} />
          <LedgerTable author={author} busy={busy} send={send} />
        </div>
      )}
    </section>
  )
}

type Send = (url: string, method: string, body: unknown, success: string) => Promise<boolean>

function ShareEditor({
  author,
  busy,
  send,
}: {
  author: AuthorEarnings
  busy: boolean
  send: Send
}) {
  const [value, setValue] = React.useState(
    author.revenueSharePercent === null ? '' : String(author.revenueSharePercent),
  )
  const [invalid, setInvalid] = React.useState(false)

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-5">
      <Label htmlFor={`share-${author.id}`}>Revenue share</Label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Input
          id={`share-${author.id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          placeholder={String(DEFAULT_SHARE_PERCENT)}
          className="w-[120px]"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            const trimmed = value.trim()
            // Blank means "use the house default" — a real choice, not an empty field, so
            // it is sent as null rather than refused.
            if (trimmed === '') {
              void send(
                `/api/admin/authors/${author.id}`,
                'PATCH',
                { revenueSharePercent: null },
                'Back to the house default',
              )
              return
            }
            const parsed = Number(trimmed)
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
              // The API says the same thing; this just saves a round trip to hear it.
              setInvalid(true)
              return
            }
            setInvalid(false)
            void send(
              `/api/admin/authors/${author.id}`,
              'PATCH',
              { revenueSharePercent: parsed },
              `Share set to ${parsed}%`,
            )
          }}
        >
          Save share
        </Button>
      </div>
      <Hint>
        {invalid
          ? 'Enter a whole number between 0 and 100, or leave it blank for the house default.'
          : `Percent of net revenue this contributor keeps. Blank uses the house default of ${DEFAULT_SHARE_PERCENT}%. Changing it affects future sales only — every entry below keeps the rate it was earned at.`}
      </Hint>
    </div>
  )
}

function WithdrawalForm({
  author,
  busy,
  send,
}: {
  author: AuthorEarnings
  busy: boolean
  send: Send
}) {
  const [amount, setAmount] = React.useState('')
  const [destination, setDestination] = React.useState('')

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-5">
      <p className="text-[17px] text-ink">Request a withdrawal</p>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-dim">
        Creating one moves nothing. It goes to the approval queue, and only an approved
        withdrawal can be marked sent.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`amt-${author.id}`}>Amount</Label>
          <Input
            id={`amt-${author.id}`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder={(author.availableCents / 100).toFixed(2)}
          />
        </div>
        <div>
          <Label htmlFor={`dest-${author.id}`}>Destination</Label>
          <Input
            id={`dest-${author.id}`}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Wallet address, or how it is being paid"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || author.availableCents <= 0}
          onClick={() => {
            const cents = parsePriceCents(amount)
            if (cents === null || cents <= 0) return
            void send(
              '/api/admin/payouts',
              'POST',
              { authorId: author.id, amountCents: cents, destination: destination || undefined },
              'Withdrawal requested — it now needs approving',
            )
          }}
        >
          {busy && <Spinner />} Request
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || author.availableCents <= 0}
          onClick={() => setAmount((author.availableCents / 100).toFixed(2))}
        >
          Fill available
        </Button>
      </div>
      {author.availableCents <= 0 && (
        <Hint>
          Nothing available yet
          {author.heldCents > 0 ? ' — this balance is still inside the holdback period.' : '.'}
        </Hint>
      )}
    </div>
  )
}

function AdjustmentForm({
  author,
  busy,
  send,
}: {
  author: AuthorEarnings
  busy: boolean
  send: Send
}) {
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-5">
      <p className="text-[17px] text-ink">Correction</p>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-dim">
        {/*
          The ledger is append-only, so a correction is a new row rather than an edit. That
          is what keeps the history of what it said before.
        */}
        Adds a row rather than changing one. Use a minus sign to take money off.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
        <div>
          <Label htmlFor={`adj-${author.id}`}>Amount</Label>
          <Input
            id={`adj-${author.id}`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="-25.00"
          />
        </div>
        <div>
          <Label htmlFor={`adjnote-${author.id}`}>What it is for</Label>
          <Input
            id={`adjnote-${author.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Agreed bonus for the launch week"
          />
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        disabled={busy}
        onClick={() => {
          const negative = amount.trim().startsWith('-')
          const cents = parsePriceCents(amount.trim().replace(/^-/, ''))
          if (cents === null || cents === 0 || !note.trim()) return
          void send(
            '/api/admin/ledger',
            'POST',
            { authorId: author.id, amountCents: negative ? -cents : cents, note: note.trim() },
            'Correction posted',
          )
        }}
      >
        Post correction
      </Button>
    </div>
  )
}

function LedgerTable({
  author,
  busy,
  send,
}: {
  author: AuthorEarnings
  busy: boolean
  send: Send
}) {
  const now = Date.now()

  if (author.entries.length === 0) {
    return <p className="text-[16px] text-ink-dim">Nothing on this ledger yet.</p>
  }

  return (
    <ul className="divide-y divide-line border-t border-line">
      {author.entries.map((entry) => {
        const held = entry.payableAt !== null && new Date(entry.payableAt).getTime() > now
        return (
          <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-[260px] flex-1">
              <span className="text-[16px] text-ink">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
              {held && (
                <span className="ml-2">
                  <Badge tone="muted">held until {entry.payableAt!.slice(0, 10)}</Badge>
                </span>
              )}
              <p className="mt-0.5 font-mono text-[12px] text-ink-dim">
                {entry.occurredAt.slice(0, 10)}
                {entry.sharePercent !== null && entry.basisCents !== null && (
                  <>
                    {' '}
                    · {entry.sharePercent}% of {formatPrice(entry.basisCents, entry.currency)} net
                  </>
                )}
                {entry.note && ` · ${entry.note}`}
              </p>
            </div>
            <span
              className={`font-mono text-[16px] ${entry.amountCents < 0 ? 'text-down' : 'text-ink'}`}
            >
              {entry.amountCents < 0 ? '−' : '+'}
              {formatPrice(Math.abs(entry.amountCents), entry.currency)}
            </span>
            {/*
              Refunding is offered against the earning it would reverse, rather than from a
              separate orders screen that does not exist. Only where there is still
              something left to refund.
            */}
            {entry.kind === 'earning' &&
              entry.orderId &&
              (entry.orderRefundableCents ?? 0) > 0 && (
                <RefundButton
                  orderId={entry.orderId}
                  authorId={entry.authorId}
                  refundableCents={entry.orderRefundableCents ?? 0}
                  currency={entry.currency}
                  busy={busy}
                  send={send}
                />
              )}
          </li>
        )
      })}
    </ul>
  )
}

function RefundButton({
  orderId,
  authorId,
  refundableCents,
  currency,
  busy,
  send,
}: {
  orderId: string
  /** The expert whose earning this is. The refund covers their part of the order only. */
  authorId?: string
  refundableCents: number
  currency: string
  busy: boolean
  send: Send
}) {
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState((refundableCents / 100).toFixed(2))
  const [reason, setReason] = React.useState('')

  if (!open) {
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(true)}>
        Record refund
      </Button>
    )
  }

  return (
    <div className="w-full rounded-lg border border-line bg-panel-2 p-4">
      <p className="text-[15px] leading-relaxed text-ink-dim">
        {/*
          Said plainly, because the opposite assumption is expensive: somebody who believes
          this refunds the buyer will not go and do it in Stripe.
        */}
        <strong className="font-medium text-ink">This refunds nobody.</strong> Issue the refund
        in Stripe or send the crypto back first, then record it here so the contributor&rsquo;s
        share is taken back. This covers this contributor&rsquo;s part of the order only — up
        to {formatPrice(refundableCents, currency)} is left on it. Refunding all of it also ends
        the access it paid for, and stops a card subscription renewing it; a partial refund
        leaves access alone.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          aria-label="Refund amount"
        />
        <Textarea
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why — shown on the contributor's statement beside the reversal"
          aria-label="Reason"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={() => {
            const cents = parsePriceCents(amount)
            if (cents === null || cents <= 0) return
            void send(
              '/api/admin/refunds',
              'POST',
              { orderId, authorId, amountCents: cents, reason: reason || undefined },
              'Refund recorded and the share reversed',
            )
          }}
        >
          Record it
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** A link out to the approval queue, shown where the balances are. */
export function WithdrawalsLink({ waiting }: { waiting: number }) {
  return (
    <Link
      href="/admin/earnings/withdrawals"
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 text-[16px] text-ink hover:border-ink-dim"
    >
      Withdrawals
      {waiting > 0 && <Badge tone="accent">{waiting} awaiting approval</Badge>}
    </Link>
  )
}
