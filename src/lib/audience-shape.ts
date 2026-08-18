/**
 * Where one member stands on one report.
 *
 * The five states are **mutually exclusive and ordered by how far the member got**:
 * read > opened > delivered > failed > never sent. Exclusive is what makes them
 * countable — a member who read the report also received it, so letting them appear in
 * both buckets would produce totals larger than the audience and a stacked bar longer
 * than the number of people it was sent to.
 *
 * `read` outranks `opened` deliberately, and not only for tidiness. Opens come from a
 * tracking pixel that Apple Mail pre-loads whether or not anyone looked, and that other
 * clients block outright — so opens are simultaneously over- and under-counted. A
 * `ReportView` is a signed-in member opening the report in the portal, which no mail
 * client can fake. When the two disagree, the view is the fact.
 */

export type AudienceState = 'read' | 'opened' | 'delivered' | 'failed' | 'not_sent'

export const AUDIENCE_STATES: {
  key: AudienceState
  label: string
  /** What this state actually means — shown to the operator, not inferred from the name. */
  meaning: string
}[] = [
  { key: 'read', label: 'Read', meaning: 'Signed in and opened the report in the portal.' },
  {
    key: 'opened',
    label: 'Opened, not read',
    meaning: 'The email was opened but the report itself was never opened.',
  },
  {
    key: 'delivered',
    label: 'Delivered, not opened',
    meaning: 'The email went out and nothing has come back from it.',
  },
  { key: 'failed', label: 'Failed', meaning: 'The provider could not deliver it.' },
  {
    key: 'not_sent',
    label: 'Never sent',
    meaning: 'An active member this report was never sent to — usually they joined after it went out.',
  },
]

export function audienceLabel(state: AudienceState): string {
  return AUDIENCE_STATES.find((entry) => entry.key === state)?.label ?? state
}

export function isAudienceState(value: string): value is AudienceState {
  return AUDIENCE_STATES.some((entry) => entry.key === value)
}

/**
 * One member's state, from the two facts we hold about them.
 *
 * `hasView` wins over every delivery status, because a member cannot have read a report
 * they were not sent — if the delivery row says `failed` and a view exists, the view is
 * what happened and the failure was a retry or a mis-recorded provider event.
 */
export function classifyAudience(input: {
  hasView: boolean
  /** The DeliveryLog status, or null when the report was never sent to them. */
  deliveryStatus: string | null
}): AudienceState {
  if (input.hasView) return 'read'
  if (input.deliveryStatus === null) return 'not_sent'
  if (input.deliveryStatus === 'failed') return 'failed'
  if (input.deliveryStatus === 'opened' || input.deliveryStatus === 'clicked') return 'opened'
  return 'delivered'
}

export type AudienceRow = {
  memberId: string
  email: string
  name: string | null
  state: AudienceState
  /** When they read it. Null unless the state is `read`. */
  viewedAt: Date | null
  /** When the email went out. Null when it never did. */
  sentAt: Date | null
}

export type AudienceCounts = Record<AudienceState, number>

export function countAudience(rows: Pick<AudienceRow, 'state'>[]): AudienceCounts {
  const counts: AudienceCounts = { read: 0, opened: 0, delivered: 0, failed: 0, not_sent: 0 }
  for (const row of rows) counts[row.state] += 1
  return counts
}

/**
 * The share who read it, out of everyone it actually reached.
 *
 * The denominator excludes `not_sent` and `failed` on purpose. Someone who joined after
 * the report went out, or whose email bounced, never had the chance to read it —
 * counting them as non-readers would make the figure a measure of list growth and
 * deliverability rather than of whether the research gets read.
 */
export function readRate(counts: AudienceCounts): number | null {
  const reached = counts.read + counts.opened + counts.delivered
  if (reached === 0) return null
  return counts.read / reached
}

/** CSV of the current view. Excel-safe: quotes doubled, every field quoted. */
export function audienceCsv(rows: AudienceRow[]): string {
  const header = ['Email', 'Name', 'State', 'Read at', 'Sent at']
  const lines = rows.map((row) =>
    [
      row.email,
      row.name ?? '',
      audienceLabel(row.state),
      row.viewedAt ? row.viewedAt.toISOString() : '',
      row.sentAt ? row.sentAt.toISOString() : '',
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [header.map((field) => `"${field}"`).join(','), ...lines].join('\n')
}
