'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-down">Error</p>
        <h1 className="mt-4 text-3xl text-ink">Something went wrong</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
          This one is on us. Try again — if it keeps happening, contact support and quote the
          reference below.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-[12px] text-ink-dim">Reference {error.digest}</p>
        )}
        <Button onClick={reset} className="mt-8">
          Try again
        </Button>
      </div>
    </div>
  )
}
