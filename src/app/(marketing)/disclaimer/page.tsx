import type { Metadata } from 'next'

import { DisclaimerText } from '@/components/disclaimer'

export const metadata: Metadata = { title: 'Disclaimer' }

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <span className="eyebrow">Legal</span>
      <h1 className="mt-3 text-4xl text-ink">Disclaimer</h1>
      <DisclaimerText className="mt-10 space-y-6 text-[16px] leading-relaxed text-ink-dim" />
    </div>
  )
}
