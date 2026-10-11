'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'

/** The test provider's button. The server refuses it unless test payments are on. */
export function SimulatePayment({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  return (
    <div className="mt-8">
      <Button
        size="lg"
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setError(null)
          const response = await fetch('/api/checkout/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
          })
          setPending(false)
          if (response.ok) router.refresh()
          else setError((await response.json().catch(() => ({}))).error ?? 'Could not simulate the payment.')
        }}
      >
        {pending && <Spinner />}
        Simulate payment
      </Button>
      {error && <p className="mt-3 text-[14px] text-down">{error}</p>}
    </div>
  )
}
