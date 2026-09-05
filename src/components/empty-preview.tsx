import Link from 'next/link'

import { PreviewBanner } from '@/components/preview-banner'

/**
 * "There is nothing here yet, and here is what to add."
 *
 * Shown to an admin previewing a sections page before any sections exist. The public
 * still gets a 404 — an empty contributors page is not something to publish — but an
 * operator who clicks Preview and receives a bare 404 has been told their preview is
 * broken, when in fact it is working and simply has nothing to draw.
 *
 * That distinction is the whole point of this file: the same empty state means "not for
 * you" to a visitor and "not yet" to the person building it.
 */
export function EmptyPreview({ what }: { what: 'coverage' | 'contributors' }) {
  return (
    <>
      <PreviewBanner />
      <div className="mx-auto max-w-2xl px-5 py-20">
        <span className="eyebrow">Preview</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Nothing to show here yet</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-dim">
          {what === 'coverage'
            ? 'This page lists every subject with somebody writing in it. It stays empty until at least one section exists.'
            : 'This page lists the experts who have a section on sale. It stays empty until at least one section exists.'}{' '}
          Visitors get a 404 rather than this — an empty page is not something to publish.
        </p>

        <ol className="mt-8 space-y-4 border-t border-line pt-8">
          {[
            { step: '01', body: 'Add a topic — Energy, Indices, Crypto.' },
            { step: '02', body: 'Add an author, with a headline and a short biography.' },
            { step: '03', body: 'Create a section pairing them, and set its price.' },
            { step: '04', body: 'Come back here. Then file reports into it from each report page.' },
          ].map((item) => (
            <li key={item.step} className="flex gap-4">
              <span className="font-mono text-[12px] tracking-[0.14em] text-accent">{item.step}</span>
              <p className="text-[15px] leading-relaxed text-ink-dim">{item.body}</p>
            </li>
          ))}
        </ol>

        <Link
          href="/admin/sections"
          className="mt-8 inline-block text-[15px] text-accent underline underline-offset-4"
        >
          Go to Admin → Sections
        </Link>
      </div>
    </>
  )
}
