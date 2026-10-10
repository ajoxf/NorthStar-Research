import type { Metadata } from 'next'
import Link from 'next/link'

import {
  LEGAL,
  LEGAL_DOCUMENTS,
  LEGAL_FACT_LABEL,
  LEGAL_REVIEWED,
  LEGAL_UPDATED,
  type LegalFact,
} from '@/lib/legal'

/** Page metadata for a document in the pack: noindex until the pack has been reviewed. */
export function legalMetadata(title: string): Metadata {
  return LEGAL_REVIEWED ? { title } : { title, robots: { index: false, follow: true } }
}

/**
 * One confirmed-or-not fact about the company.
 *
 * Renders the value when there is one and a loud marker when there is not. The marker is
 * meant to be impossible to read past: a draft that looks finished is how an unconfirmed
 * address ends up in a contract.
 */
export function Fact({ k }: { k: LegalFact }) {
  const value = LEGAL[k]
  if (value) return <>{value}</>
  return (
    <mark className="rounded bg-accent/20 px-1 font-mono text-[0.85em] text-ink">
      [TO CONFIRM: {LEGAL_FACT_LABEL[k]}]
    </mark>
  )
}

/** A contact email, linked when confirmed and marked when not. */
export function FactEmail({ k }: { k: 'supportEmail' | 'privacyEmail' | 'complaintsEmail' }) {
  const value = LEGAL[k]
  if (!value) return <Fact k={k} />
  return (
    <a href={`mailto:${value}`} className="text-accent underline underline-offset-4">
      {value}
    </a>
  )
}

/** A drafting note for the reviewing lawyer, visible only while the pack is in draft. */
export function ReviewNote({ children }: { children: React.ReactNode }) {
  if (LEGAL_REVIEWED) return null
  return (
    <aside className="rounded-lg border border-dashed border-line px-4 py-3 text-[14px] leading-relaxed text-ink-dim">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
        Note for review
      </span>
      <div className="mt-1">{children}</div>
    </aside>
  )
}

/** A numbered section of a document. */
export function Clause({
  n,
  title,
  children,
}: {
  n: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={`s${n}`} className="scroll-mt-24">
      <h2 className="mb-3 text-2xl text-ink">
        <span className="mr-3 font-mono text-[0.7em] text-ink-dim">{n}</span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/**
 * The frame every document in the pack shares: eyebrow, title, last-updated line, the
 * draft banner while unreviewed, the body, and links to the rest of the pack.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <Link href="/legal" className="eyebrow hover:underline">
        Legal
      </Link>
      <h1 className="mt-3 text-4xl text-ink">{title}</h1>
      <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
        Last updated {LEGAL_UPDATED}
      </p>

      {!LEGAL_REVIEWED && (
        <div className="mt-8 rounded-lg border border-accent/40 bg-accent/10 px-5 py-4 text-[14px] leading-relaxed text-ink">
          <strong className="font-medium">Draft for legal review.</strong> This document has not
          yet been reviewed by a qualified lawyer and is not legal advice. Items marked{' '}
          <span className="font-mono">[TO CONFIRM]</span> are still to be supplied.
        </div>
      )}

      {intro && <div className="mt-10 text-[17px] leading-relaxed text-ink">{intro}</div>}

      <div className="mt-10 space-y-10 text-[16px] leading-relaxed text-ink-dim [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>

      <nav aria-label="Other legal documents" className="mt-16 border-t border-line pt-8">
        <p className="eyebrow mb-4">Also in this pack</p>
        <ul className="grid gap-2 text-[15px] sm:grid-cols-2">
          {LEGAL_DOCUMENTS.filter((doc) => doc.title !== title).map((doc) => (
            <li key={doc.href}>
              <Link href={doc.href} className="text-ink-dim hover:text-ink">
                {doc.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
