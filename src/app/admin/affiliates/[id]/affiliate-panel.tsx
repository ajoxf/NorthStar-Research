'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

type Affiliate = {
  id: string
  name: string
  email: string
  status: 'active' | 'paused' | 'closed'
  rewardKind: 'percent' | 'fixed' | 'free_months'
  rewardAmount: number
  visitorDiscountPercent: number | null
  notes: string | null
  link: string
  rewardDescription: string
}

type Award = {
  id: string
  amount: string
  reason: string
  createdAt: string
  settled: boolean
}

/**
 * Everything an operator does with one affiliate: hand out the link, adjust the deal,
 * and keep the ledger honest.
 *
 * The ledger is append-only and settlement is a record, not a payment — this system has
 * no payout processing in it by design. Marking an award settled says "I have paid this",
 * which is why it asks for confirmation: it is a claim about the real world.
 */
export function AffiliatePanel({
  affiliate,
  awards,
}: {
  affiliate: Affiliate
  awards: Award[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  async function patch(body: Record<string, unknown>, success: string) {
    setError(null)
    setPending(true)
    try {
      const response = await fetch(`/api/admin/affiliates/${affiliate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'That change could not be saved.')
        return false
      }

      toast(success, 'success')
      router.refresh()
      return true
    } catch {
      setError('That change could not be saved.')
      return false
    } finally {
      setPending(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(affiliate.link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright; the link is on screen to select.
      toast('Copy failed — select the link and copy it by hand.', 'error')
    }
  }

  return (
    <>
      <section className="panel mt-8 p-5 sm:p-6">
        <h2 className="eyebrow mb-4">Referral link</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-panel-2 px-4 py-3 font-mono text-[13px] text-ink">
            {affiliate.link}
          </code>
          <Button variant="secondary" onClick={copyLink} className="shrink-0">
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden />
                Copy
              </>
            )}
          </Button>
        </div>
        <Hint>
          {affiliate.rewardDescription}
          {affiliate.visitorDiscountPercent
            ? ` · people using this link get ${affiliate.visitorDiscountPercent}% off their first payment`
            : ''}
        </Hint>
      </section>

      <section className="panel mt-5 p-5 sm:p-6">
        <h2 className="eyebrow mb-5">Terms</h2>

        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const discount = Number(form.get('visitorDiscountPercent') ?? 0)
            await patch(
              {
                name: String(form.get('name') ?? ''),
                email: String(form.get('email') ?? ''),
                rewardKind: String(form.get('rewardKind') ?? affiliate.rewardKind),
                rewardAmount: Number(form.get('rewardAmount') ?? 0),
                visitorDiscountPercent: discount > 0 ? discount : null,
                notes: String(form.get('notes') ?? '') || null,
              },
              'Terms saved',
            )
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={affiliate.name} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={affiliate.email} />
            </div>
            <div>
              <Label htmlFor="rewardKind">Reward type</Label>
              <select
                id="rewardKind"
                name="rewardKind"
                defaultValue={affiliate.rewardKind}
                className="h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-[15px] text-ink"
              >
                <option value="percent">% of first payment</option>
                <option value="fixed">Fixed $ per sale</option>
                <option value="free_months">Free months</option>
              </select>
            </div>
            <div>
              <Label htmlFor="rewardAmount">Amount</Label>
              <Input
                id="rewardAmount"
                name="rewardAmount"
                type="number"
                min={0}
                defaultValue={affiliate.rewardAmount}
              />
            </div>
            <div>
              <Label htmlFor="visitorDiscountPercent">Visitor discount %</Label>
              <Input
                id="visitorDiscountPercent"
                name="visitorDiscountPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={affiliate.visitorDiscountPercent ?? ''}
              />
              <Hint>100 makes the first payment free.</Hint>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" name="notes" defaultValue={affiliate.notes ?? ''} />
            </div>
          </div>

          <FieldError>{error}</FieldError>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                'Save terms'
              )}
            </Button>

            {/* Nothing is deleted. Pausing stops new credit; closing stops attribution
                entirely. Either way the history stays. */}
            {affiliate.status === 'active' ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => patch({ status: 'paused' }, 'Affiliate paused')}
              >
                Pause
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => patch({ status: 'active' }, 'Affiliate reactivated')}
              >
                Reactivate
              </Button>
            )}

            {affiliate.status !== 'closed' && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => patch({ status: 'closed' }, 'Affiliate closed')}
              >
                Close
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className="panel mt-5 p-5 sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Awards</h2>
        </div>
        <p className="mb-5 text-[13px] leading-relaxed text-ink-dim">
          Earned automatically when a referral pays. Marking one settled records that{' '}
          <span className="text-ink">you have already paid it</span> — this system does not move
          money.
        </p>

        {awards.length === 0 ? (
          <p className="text-[15px] text-ink-dim">Nothing earned yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {awards.map((award) => (
              <li
                key={award.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[15px] text-ink">{award.amount}</div>
                  <div className="truncate text-[13px] text-ink-dim">
                    {award.reason} · {award.createdAt}
                  </div>
                </div>

                {award.settled ? (
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-up">
                    Settled
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    className="shrink-0"
                    onClick={() => {
                      if (!window.confirm(`Mark ${award.amount} as already paid to ${affiliate.name}?`)) {
                        return
                      }
                      void patch({ settleAwardId: award.id }, 'Award marked settled')
                    }}
                  >
                    Mark settled
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const amount = Number(form.get('grantAmount') ?? 0)
            if (amount <= 0) return
            const ok = await patch(
              { grantAmount: amount, grantReason: String(form.get('grantReason') ?? '') },
              'Award added',
            )
            if (ok) event.currentTarget?.reset()
          }}
        >
          <div className="sm:w-40">
            <Label htmlFor="grantAmount">Add an award</Label>
            <Input id="grantAmount" name="grantAmount" type="number" min={1} placeholder="50" />
          </div>
          <div className="flex-1">
            <Label htmlFor="grantReason">Reason</Label>
            <Input id="grantReason" name="grantReason" placeholder="Launch bonus, correction…" />
          </div>
          <Button type="submit" variant="secondary" disabled={pending} className="sm:mb-0">
            Add
          </Button>
        </form>
      </section>
    </>
  )
}
