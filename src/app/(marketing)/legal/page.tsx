import Link from 'next/link'

import { LegalPage, legalMetadata } from '@/components/legal-page'
import { AGGREGATOR_STATEMENT, LEGAL_DOCUMENTS } from '@/lib/legal'

export const metadata = legalMetadata('Legal')

export default function LegalIndexPage() {
  return (
    <LegalPage title="Legal" intro={<p>{AGGREGATOR_STATEMENT}</p>}>
      <ul className="!list-none !space-y-0 divide-y divide-line !pl-0 border-y border-line">
        {LEGAL_DOCUMENTS.map((doc) => (
          <li key={doc.href}>
            <Link href={doc.href} className="group block py-4">
              <span className="block text-[18px] text-ink group-hover:underline">{doc.title}</span>
              <span className="mt-1 block text-[15px] text-ink-dim">{doc.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </LegalPage>
  )
}
