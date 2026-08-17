import type { Metadata } from 'next'
import Link from 'next/link'

import { RedeemWizard } from '@/app/(auth)/redeem/redeem-wizard'

export const metadata: Metadata = { title: 'Redeem your code' }

export default function RedeemPage({
  searchParams,
}: {
  searchParams: { code?: string; next?: string }
}) {
  return (
    <div className="w-full max-w-md animate-fade-up">
      {/*
        `next` is where they land after activating — used by share links, so somebody
        invited to read a specific edition arrives at that edition rather than the
        dashboard. It is validated server-side before any redirect uses it.
      */}
      <RedeemWizard initialCode={searchParams.code ?? ''} next={searchParams.next ?? null} />

      <p className="mt-7 border-t border-line pt-6 text-center text-[14px] text-ink-dim">
        Already activated?{' '}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}
