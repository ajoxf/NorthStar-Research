/**
 * Systematic withdrawal projection.
 *
 * Deterministic year-by-year decumulation: a portfolio grows at an assumed return while
 * a withdrawal is taken each year and indexed to inflation. Kept as a pure function with
 * no React or DOM dependency so the numbers are testable on their own.
 *
 * Read the honest limits before presenting any of this as a forecast:
 *   - Returns are a flat assumption, not a simulation. Real markets do not deliver the
 *     same number every year, and *sequence* matters enormously in decumulation — poor
 *     returns early are far more damaging than the same returns later, which a constant
 *     rate cannot express. A Monte Carlo model would capture that; this does not.
 *   - Taxes, fees and platform charges are excluded entirely.
 *   - Withdrawals are taken at the start of each year, the conservative convention:
 *     the money leaves before it can earn anything.
 */

export type WithdrawalInputs = {
  /** Starting portfolio value. */
  initialBalance: number
  /** First-year withdrawal, before any inflation indexing. */
  annualWithdrawal: number
  /** Nominal annual return, as a percentage (7 = 7%). */
  annualReturnPct: number
  /** Annual inflation, as a percentage. Indexes withdrawals and deflates real values. */
  inflationPct: number
  /** Projection horizon in years. */
  years: number
}

export type ProjectionYear = {
  year: number
  /** Balance at the start of the year, before the withdrawal. */
  openingBalance: number
  /** Withdrawal actually taken — capped at the balance available. */
  withdrawal: number
  growth: number
  closingBalance: number
  /** Closing balance expressed in today's money. */
  realClosingBalance: number
  cumulativeWithdrawn: number
}

export type ProjectionResult = {
  rows: ProjectionYear[]
  /** Year the portfolio runs out, or null if it survives the horizon. */
  depletionYear: number | null
  finalBalance: number
  finalRealBalance: number
  totalWithdrawn: number
  /** First-year withdrawal as a percentage of the starting balance. */
  initialWithdrawalRatePct: number
  /** True when the portfolio ends worth more than it started, in real terms. */
  sustainable: boolean
}

export function projectWithdrawals(inputs: WithdrawalInputs): ProjectionResult {
  const { initialBalance, annualWithdrawal, annualReturnPct, inflationPct } = inputs
  const years = Math.max(1, Math.min(60, Math.round(inputs.years)))

  const growthRate = annualReturnPct / 100
  const inflationRate = inflationPct / 100

  const rows: ProjectionYear[] = []
  let balance = initialBalance
  let cumulative = 0
  let depletionYear: number | null = null

  for (let year = 1; year <= years; year += 1) {
    const openingBalance = balance

    // Indexed to inflation so spending power is held constant, which is the point of
    // a systematic withdrawal plan.
    const targetWithdrawal = annualWithdrawal * Math.pow(1 + inflationRate, year - 1)
    // You cannot withdraw money that is not there.
    const withdrawal = Math.max(0, Math.min(targetWithdrawal, openingBalance))

    const afterWithdrawal = openingBalance - withdrawal
    const growth = afterWithdrawal * growthRate
    const closingBalance = Math.max(0, afterWithdrawal + growth)

    cumulative += withdrawal

    if (closingBalance <= 0 && depletionYear === null) depletionYear = year

    rows.push({
      year,
      openingBalance,
      withdrawal,
      growth,
      closingBalance,
      // Deflated to today's money, so a growing nominal balance cannot disguise a
      // shrinking real one.
      realClosingBalance: closingBalance / Math.pow(1 + inflationRate, year),
      cumulativeWithdrawn: cumulative,
    })

    balance = closingBalance
  }

  const last = rows[rows.length - 1]

  return {
    rows,
    depletionYear,
    finalBalance: last.closingBalance,
    finalRealBalance: last.realClosingBalance,
    totalWithdrawn: cumulative,
    initialWithdrawalRatePct:
      initialBalance > 0 ? (annualWithdrawal / initialBalance) * 100 : 0,
    sustainable: depletionYear === null && last.realClosingBalance >= initialBalance,
  }
}

export function formatCurrency(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(value)
}

/** Compact axis labels: 1.2M, 850k. */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${Math.round(value)}`
}
