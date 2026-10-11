'use client'

import * as React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { ADMIN_THEME_COOKIE, type AdminTheme } from '@/lib/admin-theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: AdminTheme; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Match system', Icon: Monitor },
  { value: 'light', label: 'Day', Icon: Sun },
  { value: 'dark', label: 'Night', Icon: Moon },
]

/**
 * Three-way theme switch.
 *
 * Applies at once by changing the attribute on the themed wrapper — the admin console's
 * or the signed-in portal's — and remembers the choice in a cookie for the server to read
 * next time. One choice for both: an admin who picks light sees light on either side. No
 * refresh: re-rendering the page to change two dozen colour variables would throw away
 * whatever form somebody was halfway through.
 */
export function ThemeToggle({ initial, onChange }: { initial: AdminTheme; onChange?: (theme: AdminTheme) => void }) {
  const [theme, setTheme] = React.useState(initial)

  function choose(next: AdminTheme) {
    setTheme(next)
    onChange?.(next)
    document.querySelectorAll('[data-admin-theme]').forEach((node) => node.setAttribute('data-admin-theme', next))
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
