'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * A password field the user can choose to read.
 *
 * Typing a password blind is where most sign-in failures actually come from — a
 * mistyped character on a phone keyboard is invisible, and the only feedback is a
 * rejection that looks identical to a forgotten password. Letting someone check what
 * they typed removes a whole class of "it says my password is wrong".
 *
 * It is off by default and reverts on every mount, so a revealed password never
 * survives a navigation or a page reload into a context the user did not choose.
 *
 * The toggle is a real `button` with a label rather than a decorative icon: screen
 * reader users need to know both that it exists and what state it is in, and it must be
 * reachable from the keyboard.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function PasswordInput({ className, ...props }, ref) {
  const [revealed, setRevealed] = React.useState(false)

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={revealed ? 'text' : 'password'}
        // Room for the toggle, so a long password never runs underneath it.
        className={cn('pr-11', className)}
        {...props}
      />

      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        // Excluded from tab order: it sits between the password field and the submit
        // button, and stopping there on the way to signing in is friction for everyone
        // who does not want it. Still reachable, and still announced, on demand.
        tabIndex={-1}
        aria-pressed={revealed}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        title={revealed ? 'Hide password' : 'Show password'}
        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-dim transition-colors hover:text-ink focus:outline-none focus-visible:text-accent"
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  )
})
