import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

import { engagementSummary } from '@/lib/engagement'
import { formatDate } from '@/lib/utils'

/**
 * Who received what, who opened it, and who actually read it.
 *
 * The three columns are not equally trustworthy, and the panel says so rather than
 * presenting them as one row of equivalent facts:
 *
 *   - **Sent** is ours, and exact.
 *   - **Opened** comes from a tracking pixel and is the weakest figure here — Apple Mail
 *     pre-loads it whether or not anyone looked, and other clients block it outright.
 *   - **Read** is a signed-in member opening the report in the portal. It is the only
 *     number that cannot be faked by a mail client, and the one to run the business on.
 *
 * There is no "forwarded" column because forwarding is not observable — see the note in
 * src/lib/engagement.ts. What matters about forwarding is already handled elsewhere: a
 * forwarded report link gets the recipient a sign-in page, not the research.
 */
export async function EngagementPanel() {
  const { reports, members, openTrackingLive } = await engagementSummary()

  if (reports.length === 0) return null

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
          Engagement
        </h2>
        <Link href="/admin/engagement" className="font-mono text-[12px] text-accent hover:underline">
          Who is reading
        </Link>
      </div>

      {!openTrackingLive && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3.5 text-[13px] leading-relaxed text-ink-dim">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>
            <strong className="font-medium text-ink">Opens are not being tracked yet.</strong> Add
            a Resend webhook pointing at{' '}
            <code className="font-mono text-[12px]">/api/webhooks/resend</code> and set{' '}
            <code className="font-mono text-[12px]">RESEND_WEBHOOK_SECRET</code>. Until then the
            Opened column stays at zero — <span className="text-ink">Read</span> is unaffected and
            is the better measure anyway.
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By report">
          <Table head={['Report', 'Sent', 'Opened', 'Read']}>
            {reports.map((report) => (
              <tr key={report.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/reports/${report.id}`}
                    className="text-[13px] text-ink hover:text-accent"
                  >
                    {report.title}
                  </Link>
                  <p className="font-mono text-[11px] text-ink-dim">
                    {formatDate(report.publishDate)}
                    {report.failed > 0 && (
                      <span className="text-down"> · {report.failed} failed</span>
                    )}
                  </p>
                </td>
                <Num value={report.sent} />
                <Num value={report.opened} dim={!openTrackingLive} />
                <Num value={report.read} strong />
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="By member">
          <Table head={['Member', 'Sent', 'Opened', 'Read']}>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/members/${member.id}`}
                    className="break-all text-[13px] text-ink hover:text-accent"
                  >
                    {member.email}
                  </Link>
                  <p className="font-mono text-[11px] text-ink-dim">
                    {member.lastReadAt ? `last read ${formatDate(member.lastReadAt)}` : 'never read'}
                  </p>
                </td>
                <Num value={member.sent} />
                <Num value={member.opened} dim={!openTrackingLive} />
                <Num value={member.read} strong />
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-dim">
        <span className="text-ink">Read</span> means a signed-in member opened the report in the
        portal — the only figure here that a mail client cannot distort.{' '}
        <span className="text-ink">Opened</span> comes from a tracking pixel, which some clients
        pre-load and others block, so treat it as directional across the list rather than true of
        any one person. Forwarding cannot be measured by anyone; a forwarded report link opens a
        sign-in page, not the research.
      </p>
    </section>
  )
}

/**
 * `min-w-0` on the root is load-bearing: a grid item defaults to `min-width: auto`, so
 * without it the item is sized by the table inside and the whole page scrolls sideways on
 * a phone rather than the table scrolling within its own box.
 */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-panel">
      <p className="border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
        {title}
      </p>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full min-w-[300px] text-left">
      <thead>
        <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          {head.map((label, index) => (
            <th key={label} className={index === 0 ? 'px-4 py-2 font-medium' : 'px-3 py-2 font-medium'}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function Num({ value, strong, dim }: { value: number; strong?: boolean; dim?: boolean }) {
  return (
    <td
      className={`px-3 py-2.5 font-mono text-[13px] ${
        strong ? 'text-ink' : dim ? 'text-ink-dim/40' : 'text-ink-dim'
      }`}
    >
      {value}
    </td>
  )
}
