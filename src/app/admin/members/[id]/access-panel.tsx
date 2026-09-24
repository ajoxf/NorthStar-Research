'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import {
  ACCESS_SOURCE_LABEL,
  ACCESS_STATE_LABEL,
  type AccessSource,
  type AccessState,
} from '@/lib/access-view'
import { formatDate } from '@/lib/utils'

export type AccessRow = {
  id: string
  /** The section this grants, or the product's name when it is not a section. */
  name: string
  isSection: boolean
  source: AccessSource
  state: AccessState
  renewsAt: string | null
  daysLeft: number | null
}

/**
 * What this member can actually read, and why.
 *
 * The admin has never shown this. `Member.subscriptionStatus` — the green ACTIVE badge on
 * the members list — is the *legacy all-access membership*, a different grant from the
 * entitlement rows that decide section access, and showing only the first meant an
 * operator had no way to answer "what is this person paying for" or "why can they open
 * that". Both questions came up the moment sections went on sale.
 *
 * The all-access line is first and says so in words rather than as a badge, because when
 * it is on, everything below it is decoration: the member reads the whole site whether or
 * not any section here is live.
 */
export function AccessPanel({
  memberId,
  rows,
  allAccess,
  allAccessIsLoadBearing,
  grantable,
}: {
  memberId: string
  rows: AccessRow[]
  allAccess: boolean
  allAccessIsLoadBearing: boolean
  /** Sections this member does not already hold, for the grant control. */
  grantable: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [sectionId, setSectionId] = React.useState('')
  const [months, setMonths] = React.useState('1')

  async function send(url: string, method: string, body: unknown, done: string) {
    setBusy(true)
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // Parsed defensively: a platform failure comes back as HTML, and calling .json() on
      // it would throw away the status entirely.
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return false
      }
      /*
        A warning is not a failure, and must not be swallowed.

        Stopping access on a card subscription that is still live at Stripe will be undone
        by the next invoice. The write succeeded, so this is not an error — but an operator
        told only "Access stopped" would find it back next month and have no idea why.
      */
      if (typeof data?.warning === 'string' && data.warning) {
        toast(data.warning, 'error')
      } else {
        toast(done, 'success')
      }
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  const stateTone = (state: AccessState) =>
    state === 'live' ? 'up' : state === 'open-ended' ? 'accent' : state === 'pending' ? 'muted' : 'down'

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
        Access
      </h2>

      {/*
        Said in words, not as a badge.

        A badge reading ACTIVE is what the members list already shows, and it is exactly
        what misleads: it looks like "paid up" and means "reads everything". The sentence
        is longer on purpose.
      */}
      <div
        className={`rounded-lg border p-4 text-[14px] leading-relaxed ${
          allAccessIsLoadBearing
            ? 'border-accent/40 bg-accent/10 text-ink'
            : 'border-line bg-panel text-ink-dim'
        }`}
      >
        {allAccess ? (
          <>
            <strong className="text-ink">This member reads everything.</strong> The legacy
            all-access membership is on, so every report on the site is open to them
            {allAccessIsLoadBearing
              ? ' — and they hold no section of their own, so this is the only thing granting it.'
              : ' regardless of the sections listed below.'}{' '}
            Set the subscription to expired to fall back to section access.
          </>
        ) : rows.length === 0 ? (
          <>This member holds nothing. They can sign in, and there is nothing for them to read.</>
        ) : (
          <>
            Access is per section. They read exactly what is marked live below, and nothing
            else.
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-panel font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
              <tr>
                <th className="px-4 py-2.5 font-medium">Section</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 font-medium">Came from</th>
                <th className="px-4 py-2.5 font-medium">Renews</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-ink">
                    {row.name}
                    {/* A product is not a section. The portal gate counts only sections,
                        so an operator reading this list needs to know which is which. */}
                    {!row.isSection && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                        product
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={stateTone(row.state)}>{ACCESS_STATE_LABEL[row.state]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{ACCESS_SOURCE_LABEL[row.source]}</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {row.renewsAt ? (
                      <>
                        {formatDate(new Date(row.renewsAt))}
                        {/* The countdown, because a date alone makes an operator do the
                            arithmetic on every row of a list they are triaging. */}
                        {row.daysLeft !== null && (
                          <span className="ml-2 font-mono text-[11px]">
                            {row.daysLeft >= 0 ? `${row.daysLeft}d left` : `${-row.daysLeft}d ago`}
                          </span>
                        )}
                      </>
                    ) : (
                      'Never'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/*
                      Expire, not delete.

                      Nothing here is ever removed: the row stays, with its history, and
                      stops granting. A deleted entitlement takes with it the only record
                      that this person ever had access, which is the record an operator
                      handling a billing dispute needs most.
                    */}
                    {(row.state === 'live' || row.state === 'open-ended') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Stop this member's access to "${row.name}" now? The record is kept; it simply stops granting.`,
                            )
                          ) {
                            return
                          }
                          void send(
                            `/api/admin/members/${memberId}/access/${row.id}`,
                            'PATCH',
                            { action: 'expire' },
                            'Access stopped',
                          )
                        }}
                      >
                        <X className="h-3 w-3" aria-hidden />
                        Stop
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!adding ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-4"
          disabled={busy || grantable.length === 0}
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {grantable.length === 0 ? 'They already hold every section' : 'Grant a section'}
        </Button>
      ) : (
        <div className="mt-4 rounded-lg border border-line bg-panel p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div>
              <Label htmlFor="grant-section">Section</Label>
              <Select
                id="grant-section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                <option value="">Choose…</option>
                {grantable.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="grant-months">For how long</Label>
              <Select
                id="grant-months"
                value={months}
                onChange={(event) => setMonths(event.target.value)}
              >
                <option value="1">1 month</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                {/* Its own option rather than a blank field, so open-ended access is
                    always something somebody chose on purpose. */}
                <option value="open">Open-ended</option>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !sectionId}
              onClick={async () => {
                const ok = await send(
                  `/api/admin/members/${memberId}/access`,
                  'POST',
                  { sectionId, months: months === 'open' ? null : Number(months) },
                  'Section granted',
                )
                if (ok) {
                  setAdding(false)
                  setSectionId('')
                }
              }}
            >
              {busy ? <Spinner /> : null}
              Grant
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
