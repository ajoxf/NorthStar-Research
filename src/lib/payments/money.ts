/**
 * Minor units per currency, for providers that want major-unit strings.
 *
 * Most currencies have cents. A few have none (JPY, KRW) and a few have thousandths (the
 * Gulf dinars and the rial) — a Tap charge in KWD with two decimals is off by a factor of
 * ten, so this is not a detail.
 */
const ZERO_DECIMAL = new Set(['JPY', 'KRW'])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'JOD'])

export function minorUnitsFactor(currency: string): number {
  const code = currency.toUpperCase()
  if (ZERO_DECIMAL.has(code)) return 1
  if (THREE_DECIMAL.has(code)) return 1000
  return 100
}

function decimals(currency: string): number {
  return Math.round(Math.log10(minorUnitsFactor(currency)))
}

/** 12900 USD → "129.00"; 1500 KWD → "1.500"; 500 JPY → "500". */
export function toMajorString(minor: number, currency: string): string {
  return (minor / minorUnitsFactor(currency)).toFixed(decimals(currency))
}

/** "129.00" or 129 → 12900, rounded to the nearest minor unit. */
export function fromMajor(major: number | string, currency: string): number {
  return Math.round(Number(major) * minorUnitsFactor(currency))
}
