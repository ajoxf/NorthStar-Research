/**
 * The pure pieces of the affiliate and expert reports: masking, periods, daily series, CSV.
 *
 * Kept free of the database so each rule can be tested on its own.
 */

/**
 * A referred person's name as an affiliate sees it: "Sarah K.".
 *
 * The person is a customer of the site, not of the affiliate, so the affiliate gets enough
 * to recognise a client they introduced and no more. A single name is shown as it is,
 * since a first name alone says nothing an initial would hide. No name at all falls back
 * to the first letter of the email.
 */
export function maskName(firstName: string | null | undefined, lastName: string | null | undefined, email: string): string {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  if (first && last) return `${first} ${last[0].toUpperCase()}.`
  if (first || last) return first || last
  return `${(email.trim()[0] ?? '?').toUpperCase()}•••`
}

/** "s•••@gmail.com": the domain is kept, since it is usually a provider and says little. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email[0]}•••${email.slice(at)}`
}

export const PERIODS = [7, 30, 90, 365] as const
export type Period = (typeof PERIODS)[number]

export function parsePeriod(input: unknown, fallback: Period = 30): Period {
  const value = Number(Array.isArray(input) ? input[0] : input)
  return (PERIODS as readonly number[]).includes(value) ? (value as Period) : fallback
}

export function periodLabel(days: Period): string {
  return days === 365 ? '12 months' : `${days} days`
}

/** The first moment counted in a period of `days` ending now: midnight UTC, `days - 1` days ago. */
export function periodStart(days: number, now: Date = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return start
}

export type DayPoint = { day: string; value: number }

/**
 * One point per UTC day in the period, oldest first, with days that had nothing as zero —
 * a chart that skipped quiet days would draw a busy week and a dead one the same width.
 */
export function dailySeries(events: { at: Date; value?: number }[], days: number, now: Date = new Date()): DayPoint[] {
  const start = periodStart(days, now)
  const points: DayPoint[] = []
  const index = new Map<string, number>()
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + offset)
    const key = day.toISOString().slice(0, 10)
    index.set(key, points.length)
    points.push({ day: key, value: 0 })
  }
  for (const event of events) {
    const slot = index.get(event.at.toISOString().slice(0, 10))
    if (slot !== undefined) points[slot].value += event.value ?? 1
  }
  return points
}

/**
 * The same series in 7-day buckets, counted back from the last day so the newest bucket
 * always ends today; the oldest may be short. Each point is labelled with its first day.
 * For figures where a single day could single out one payment, a week is the finest grain.
 */
export function weeklySeries(daily: DayPoint[]): DayPoint[] {
  const weeks: DayPoint[] = []
  for (let end = daily.length; end > 0; end -= 7) {
    const slice = daily.slice(Math.max(0, end - 7), end)
    weeks.unshift({ day: slice[0].day, value: slice.reduce((sum, point) => sum + point.value, 0) })
  }
  return weeks
}

/**
 * The host a click came from, for "where your clicks come from": "youtube.com", not the
 * page. A full referring URL can carry someone's search terms or a private link, so only
 * the host is ever kept. "www." is dropped so the same site counts once; our own pages,
 * and anything that is not an http(s) URL, count as no referrer.
 */
export function referrerHostOf(referrer: string | null | undefined, ownHost?: string | null): string | null {
  if (!referrer) return null
  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '').slice(0, 100)
  if (!host) return null
  const own = (ownHost ?? '').toLowerCase().split(':')[0].replace(/^www\./, '')
  return own && host === own ? null : host
}

/** An ISO country code as the edge reports it, or null for anything that is not one ("XX" included). */
export function countryCodeOf(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : null
}

/**
 * The most common values with their counts, largest first, the rest folded into one
 * "other" row so a long tail does not push the list off the page. Null counts as its own
 * key (a direct visit, an unknown country) and is kept.
 */
export function topCounts<T extends string | null>(values: T[], limit: number): { key: T | 'other'; count: number }[] {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
  const top: { key: T | 'other'; count: number }[] = sorted.slice(0, limit).map(([key, count]) => ({ key, count }))
  const rest = sorted.slice(limit).reduce((sum, [, count]) => sum + count, 0)
  if (rest > 0) top.push({ key: 'other', count: rest })
  return top
}

/**
 * One CSV field, quoted, with quotes doubled. A field a spreadsheet would read as a
 * formula (=, +, -, @, tab, return) is prefixed with an apostrophe: a client's name is
 * typed by the client, and opening a statement must never run what they typed.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  // A plain number ("-20.00") is left alone: it is a number, not a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function csv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Cents as a plain decimal for a spreadsheet: 12345 → "123.45", -50 → "-0.50". */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** A share as a whole percent, or null when there is nothing to divide by. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}
