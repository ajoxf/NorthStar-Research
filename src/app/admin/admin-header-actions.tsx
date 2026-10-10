'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'

import { ADMIN_THEME_COOKIE, type AdminTheme } from '@/lib/admin-theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: AdminTheme; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Match system', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

/**
 * Three-way theme switch.
 *
 * Applies at once by changing the attribute on the console's wrapper, and remembers the
 * choice in a cookie for the server to read next time. No refresh: re-rendering the whole
 * console to change two dozen colour variables would throw away whatever form somebody
 * was halfway through.
 */
export function ThemeToggle({ initial }: { initial: AdminTheme }) {
  const [theme, setTheme] = React.useState(initial)

  function choose(next: AdminTheme) {
    setTheme(next)
    document.querySelector('[data-admin-theme]')?.setAttribute('data-admin-theme', next)
    // A year, site-wide path so the login page wears it too. Not a secret; no HttpOnly.
    document.cookie = `${ADMIN_THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center rounded-full border border-line p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
            theme === value ? 'bg-panel text-ink' : 'text-ink-dim hover:text-ink',
          )}
        >
          <Icon aria-hidden className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

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
