import type { Metadata } from 'next'
import Link from 'next/link'

import { RedeemWizard } from '@/app/(auth)/redeem/redeem-wizard'

export const metadata: Metadata = { title: 'Redeem your code' }

export default function RedeemPage({ searchParams }: { searchParams: { code?: string } }) {
  return (
    <div className="w-full max-w-md animate-fade-up">
      <RedeemWizard initialCode={searchParams.code ?? ''} />

      <p className="mt-7 border-t border-line pt-6 text-center text-[14px] text-ink-dim">
        Already activated?{' '}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}
