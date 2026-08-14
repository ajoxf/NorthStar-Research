'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'

import { ProjectionChart } from '@/components/projection-chart'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { formatCurrency, projectWithdrawals, type WithdrawalInputs } from '@/lib/withdrawal-model'

const DEFAULTS: WithdrawalInputs = {
  initialBalance: 1_000_000,
  annualWithdrawal: 40_000,
  annualReturnPct: 6.5,
  inflationPct: 2.5,
  years: 30,
}

export function WithdrawalPlanner() {
  const [inputs, setInputs] = React.useState<WithdrawalInputs>(DEFAULTS)

  // Pure and cheap, so it recomputes as the member types — no submit button needed.
  const result = React.useMemo(() => projectWithdrawals(inputs), [inputs])

  function update(key: keyof WithdrawalInputs, raw: string) {
    const value = Number(raw.replace(/[^0-9.-]/g, ''))
    setInputs((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }))
  }

  const depleted = result.depletionYear !== null

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section className="panel h-fit p-6">
          <h2 className="eyebrow mb-5">Assumptions</h2>

          <div className="space-y-4">
            <Field
              id="initialBalance"
              label="Portfolio value"
              prefix="$"
              value={inputs.initialBalance}
              onChange={(v) => update('initialBalance', v)}
            />
            <Field
              id="annualWithdrawal"
              label="Annual withdrawal"
              prefix="$"
              value={inputs.annualWithdrawal}
              onChange={(v) => update('annualWithdrawal', v)}
              hint={`${result.initialWithdrawalRatePct.toFixed(2)}% of the portfolio in year one`}
            />
            <Field
              id="annualReturnPct"
              label="Expected annual return"
              suffix="%"
              step="0.1"
              value={inputs.annualReturnPct}
              onChange={(v) => update('annualReturnPct', v)}
            />
            <Field
              id="inflationPct"
              label="Inflation"
              suffix="%"
              step="0.1"
              value={inputs.inflationPct}
              onChange={(v) => update('inflationPct', v)}
              hint="Withdrawals rise with inflation to hold spending power"
            />
            <Field
              id="years"
              label="Horizon"
              suffix="yrs"
              value={inputs.years}
              onChange={(v) => update('years', v)}
            />
          </div>

          <Button
            variant="ghost"
            className="mt-5 w-full"
            onClick={() => setInputs(DEFAULTS)}
            disabled={JSON.stringify(inputs) === JSON.stringify(DEFAULTS)}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </Button>
        </section>

        <div>
          <div
            className={cn(
              'mb-5 flex items-start gap-3 rounded-xl border p-5',
              depleted ? 'border-down/40 bg-down/10' : 'border-up/35 bg-up/10',
            )}
            role="status"
          >
            {depleted ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-down" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-up" aria-hidden />
            )}
            <div>
              <p className="text-[16px] text-ink">
                {depleted
                  ? `The portfolio runs out in year ${result.depletionYear}.`
                  : `The portfolio lasts the full ${inputs.years} years.`}
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">
                {depleted
                  ? 'Reduce the withdrawal, extend the return assumption, or shorten the horizon to close the gap.'
                  : result.sustainable
                    ? 'It also ends worth more than it started in real terms, so the capital base is intact.'
                    : "It survives, but purchasing power erodes — the ending balance is worth less than today's in real terms."}
              </p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ending balance" value={formatCurrency(result.finalBalance)} />
            <Stat label="In today's money" value={formatCurrency(result.finalRealBalance)} />
            <Stat label="Total withdrawn" value={formatCurrency(result.totalWithdrawn)} />
            <Stat
              label="Initial rate"
              value={`${result.initialWithdrawalRatePct.toFixed(2)}%`}
            />
          </div>

          <section className="panel p-5 sm:p-6">
            <h2 className="mb-1 font-display text-lg text-ink">Projected balance</h2>
            <p className="mb-4 text-[13px] text-ink-dim">
              Nominal balance against the same balance expressed in today&apos;s money.
            </p>
            <ProjectionChart rows={result.rows} />
          </section>
        </div>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ink">
          Year by year
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
                <th className="px-5 py-3 font-medium">Year</th>
                <th className="px-5 py-3 text-right font-medium">Opening</th>
                <th className="px-5 py-3 text-right font-medium">Withdrawal</th>
                <th className="px-5 py-3 text-right font-medium">Growth</th>
                <th className="px-5 py-3 text-right font-medium">Closing</th>
                <th className="px-5 py-3 text-right font-medium">Today&apos;s money</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={row.year}
                  className={cn(
                    'border-b border-line font-mono text-[13px] last:border-b-0',
                    row.closingBalance <= 0 && 'opacity-50',
                  )}
                >
                  <td className="px-5 py-2.5 text-ink-dim">{row.year}</td>
                  <td className="px-5 py-2.5 text-right text-ink">
                    {formatCurrency(row.openingBalance)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-down">
                    −{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-up">
                    +{formatCurrency(row.growth)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-ink">
                    {formatCurrency(row.closingBalance)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-ink-dim">
                    {formatCurrency(row.realClosingBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  step,
}: {
  id: string
  label: string
  value: number
  onChange: (value: string) => void
  prefix?: string
  suffix?: string
  hint?: string
  step?: string
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-dim">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn('font-mono', prefix && 'pl-7', suffix && 'pr-12')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-dim">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{hint}</p>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className="mt-1.5 font-mono text-[17px] text-ink">{value}</div>
    </div>
  )
}
