'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Globe, EyeOff } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Put an expert on the site, or take them off it.
 *
 * Off is for setting somebody up: they can sign in and upload, and the desk can build their
 * sections and prices, while visitors see nothing of theirs. Asked before either way,
 * because going live puts their subjects on sale and taking them off withdraws them.
 */
export function LiveSwitch({ authorId, name, live }: { authorId: string; name: string; live: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)

  async function flip() {
    const question = live
      ? `Take ${name} off the site? Their profile, subjects and packages stop showing and stop selling. Existing subscribers keep reading.`
      : `Put ${name} live? Their profile, subjects and packages will show to visitors and go on sale.`
    if (!window.confirm(question)) return
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/authors/${authorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live: !live }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return
      }
      toast(live ? `${name} is off the site` : `${name} is live`)
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant={live ? 'secondary' : 'primary'} disabled={busy} onClick={flip}>
      {busy ? <Spinner /> : live ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Globe className="h-3.5 w-3.5" aria-hidden />}
      {live ? 'Take off site' : 'Put live'}
    </Button>
  )
}
