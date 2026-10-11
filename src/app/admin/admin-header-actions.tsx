'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'


export { ThemeToggle } from '@/components/theme-toggle'

/**
 * Sign out, beside the email it signs out.
 *
 * The same endpoint the member account page uses — there is one session, whichever side
 * of the site it was started from — and back to the admin login rather than the home
 * page, because the next thing an operator does after signing out is usually sign in as
 * somebody else.
 */
export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function signOut() {
    setPending(true)
    // Only leave once the session is actually gone. Landing on the login page still signed
    // in would say "you are out" about a session that is not.
    const response = await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    if (!response?.ok) {
      setPending(false)
      return
    }
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[13px] text-ink-dim transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-50"
    >
      <LogOut aria-hidden className="h-3.5 w-3.5" />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
