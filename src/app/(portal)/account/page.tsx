import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AccountForms } from '@/app/(portal)/account/account-forms'
import { Badge, statusTone } from '@/components/ui/badge'
import { accessSummary, type AccessLine } from '@/lib/access-summary'
import { daysUntilRenewal, getCurrentMember, readSession } from '@/lib/auth'
import { canSetPasswordWithoutCurrent } from '@/lib/password-reset-shape'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Account' }
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const member = await getCurrentMember()
  const session = await readSession()
  if (!member) redirect('/login?next=/account')

  const daysLeft = daysUntilRenewal(member)
  const access = await accessSummary(member)

  const reportsRead = await db.reportView.findMany({
    where: { memberId: member.id },
    select: { reportId: true },
    distinct: ['reportId'],
  })

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <span className="eyebrow">Your account</span>
      <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Settings</h1>

      {/*
        What they hold, before anything else on the page.
        ----------------------------------------------------
        The membership panel below reports the research subscription and nothing more,
        which is correct but partial: somebody holding a live Nexus RAMP entitlement read
        "PENDING" there and had nowhere at all to see what they actually had. This states
        it plainly and first, research and products together, because "what have I got" is
        the question somebody opens this page to answer.
      */}
      <section className="panel mt-8 p-6">
        <h2 className="eyebrow mb-5">What you have access to</h2>
        {access.length === 0 ? (
          <p className="text-[15px] leading-relaxed text-ink-dim">
            Nothing active on this account yet. If you have been sent a code, redeem it on{' '}
            <Link href="/redeem" className="text-accent underline underline-offset-4">
              the redemption page
            </Link>
            .
          </p>
        ) : (
          <AccessTable lines={access} />
        )}
      </section>

      <section className="panel mt-8 p-6">
        {/* Named for what it is. Titled "Membership", its PENDING sat over a live product
            entitlement and read as the state of the whole account. */}
        <h2 className="eyebrow mb-5">Research membership</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] text-ink-dim">Status</dt>
            <dd className="mt-1.5">
              <Badge tone={statusTone(member.subscriptionStatus)}>{member.subscriptionStatus}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Member since</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {formatDate(member.subscriptionStartedAt ?? member.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">
              {member.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}
            </dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {member.subscriptionRenewsAt ? formatDate(member.subscriptionRenewsAt) : '—'}
              {daysLeft !== null && daysLeft >= 0 && (
                <span className="ml-2 text-ink-dim">
                  ({daysLeft} {daysLeft === 1 ? 'day' : 'days'})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Billing</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {member.billingProvider === 'stripe'
                ? 'Card — renews automatically'
                : member.billingProvider === 'cregis'
                  ? 'Crypto — renew manually'
                  : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Email</dt>
            <dd className="mt-1.5 break-all font-mono text-[13px] text-ink">{member.email}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-dim">Reports read</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">{reportsRead.length}</dd>
          </div>
        </dl>
      </section>

      <AccountForms
        member={{
          billingProvider: member.billingProvider,
          cancelAtPeriodEnd: member.cancelAtPeriodEnd,
          firstName: member.firstName,
          lastName: member.lastName,
          phoneNumber: member.phoneNumber,
        }}
        /*
         * Whether this visit may set a password without the old one. Computed by the same
         * function the API enforces it with, so the form never asks for something the
         * server does not want, nor hides a field the server will insist on.
         */
        canSetPasswordWithoutCurrent={
          session !== null &&
          canSetPasswordWithoutCurrent({
            hasPassword: member.passwordHash !== null,
            via: session.via,
            viaAt: session.viaAt,
          })
        }
      />
    </div>
  )
}

/**
 * What the member holds, one row each.
 *
 * A table because these are the same five facts about every entitlement, and columns let
 * somebody holding four of them compare down a column instead of reading four paragraphs.
 * The stacked cards it replaces made every row look like an announcement.
 *
 * Below 640px it is not a table at all: five columns in 390px either overflow or crush the
 * product name to three characters. The same rows render as cards there, each field
 * labelled, which is the only honest way to show a table that does not fit.
 *
 * The dates and the billing line are facts off the row, not inferences. Where nothing is
 * attached it says so in the terms that matter to somebody reading it — that no payment is
 * coming — rather than naming our internal absence of a provider.
 */
function AccessTable({ lines }: { lines: AccessLine[] }) {
  return (
    <>
      {/* The table, from 640px up. */}
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-panel sm:block">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              <th className="w-[42%] px-4 py-3 font-medium">What you hold</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Type</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Runs until</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.kind}:${line.name}`} className="border-b border-line last:border-b-0 align-top">
                <td className="px-4 py-3">
                  <span className="block text-[15px] text-ink">{line.name}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-dim">{line.detail}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={line.kind === 'product' ? 'accent' : 'up'}>
                    {line.kind === 'product' ? 'Platform' : 'Research'}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-ink">
                  {endsText(line)}
                </td>
                <td className="px-4 py-3 text-[13px] leading-relaxed text-ink-dim">{billingText(line)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {line.openHref && (
                    <a href={line.openHref} className="text-[14px] font-medium text-accent underline underline-offset-4">
                      Open
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The same rows as cards, below 640px. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {lines.map((line) => (
          <li key={`${line.kind}:${line.name}`} className="rounded-lg border border-line bg-panel-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-[16px] font-medium text-ink">{line.name}</h3>
              <Badge tone={line.kind === 'product' ? 'accent' : 'up'}>
                {line.kind === 'product' ? 'Platform' : 'Research'}
              </Badge>
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-dim">{line.detail}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-ink-dim">Runs until</dt>
              <dd className="font-mono text-ink">{endsText(line)}</dd>
              <dt className="text-ink-dim">Billing</dt>
              <dd className="text-ink-dim">{billingText(line)}</dd>
            </dl>
            {line.openHref && (
              <a href={line.openHref} className="mt-3 inline-block text-[14px] font-medium text-accent underline underline-offset-4">
                Open {line.name}
              </a>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

const endsText = (line: AccessLine) =>
  line.endsAt ? formatDate(line.endsAt) : 'No end date'

/*
 * Short, because the column above already says "Billing" and a wrapped two-line cell in a
 * four-word column reads worse than the extra words are worth. "None" under that header
 * says exactly what a trialist needs to know: nothing is going to be charged.
 */
const billingText = (line: AccessLine) =>
  line.billing === 'stripe'
    ? 'Card, automatic'
    : line.billing === 'cregis'
      ? 'Crypto, manual'
      : 'None'
