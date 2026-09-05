'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { MAX_CODE_VALIDITY_DAYS } from '@/lib/codes'
import { formatDate } from '@/lib/utils'

/** The common answers, one click away. Any other number is typed in below them. */
const PRESETS = [7, 14, 30, 90]

/** Roughly how tall the menu is, used only to decide whether it opens up or down. */
const MENU_HEIGHT = 300

/**
 * Give one code more time, from the row it is on.
 *
 * This is the answer to a real email — "the code you sent me has stopped working" — so it
 * lives beside the expiry date rather than behind a code detail page nobody would think to
 * open. One click, from the list, while reading the reply.
 *
 * Presets for the common answers, and a field for any other number. The presets are what
 * an operator reaches for nine times in ten — "a fortnight", "the rest of the quarter" —
 * but four buttons cannot express "until the 31st", and a menu that silently cannot do
 * what you need is worse than one extra input.
 *
 * No confirm dialog: extending a code sends no email, charges nobody, and is undone by
 * extending it again. The one irreversible-feeling choice — clearing the expiry — says
 * what it means in the menu.
 */
export function ExtendCode({
  codeId,
  code,
  expiresAt,
}: {
  codeId: string
  code: string
  /** ISO string, or null when the code already never expires. */
  expiresAt: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)
  const [custom, setCustom] = React.useState('')
  // Where to draw the menu, in viewport coordinates. Null means closed.
  //
  // The menu is portalled to the body and positioned rather than laid out next to the
  // button, because the codes table scrolls horizontally — an absolutely positioned menu
  // inside it is clipped by that overflow, and on the last rows most of it disappears.
  const [at, setAt] = React.useState<{ top?: number; bottom?: number; right: number } | null>(
    null,
  )
  const open = at !== null
  const button = React.useRef<HTMLButtonElement>(null)
  const menu = React.useRef<HTMLDivElement>(null)

  const place = React.useCallback(() => {
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return

    // Flip above the button when there is not room below it. Without this the menu on the
    // last visible row of a long codes table opens past the bottom of the window — and
    // being fixed, it cannot be scrolled to, so the action simply does nothing.
    const right = window.innerWidth - rect.right
    const roomBelow = window.innerHeight - rect.bottom
    setAt(
      roomBelow < MENU_HEIGHT && rect.top > roomBelow
        ? { bottom: window.innerHeight - rect.top + 6, right }
        : { top: rect.bottom + 6, right },
    )
  }, [])

  // Click-away and Escape. Scroll and resize re-place the menu rather than closing it: it
  // is portalled to the body, so it does not travel with its row, and closing on scroll
  // means a click that itself scrolls the row into view dismisses the menu it just opened.
  React.useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (button.current?.contains(target) || menu.current?.contains(target)) return
      setAt(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAt(null)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  async function extend(body: { extendDays: number } | { neverExpires: true }) {
    setPending(true)
    try {
      const response = await fetch(`/api/admin/codes/${codeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return
      }

      // The new date, not "extended" — the operator is about to type it into a reply, and
      // a generic success would send them back to the table to look it up.
      toast(
        data.expiresAt
          ? `${code} now works until ${formatDate(new Date(data.expiresAt))}.`
          : `${code} no longer expires.`,
      )
      setAt(null)
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (open ? setAt(null) : place())}
        disabled={pending}
        aria-expanded={open}
        aria-label={`Extend ${code}`}
        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 font-mono text-[11px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-50"
      >
        {pending ? <Spinner /> : <CalendarPlus className="h-3 w-3" aria-hidden />}
        Extend
      </button>

      {at !== null &&
        createPortal(
          <div
            ref={menu}
            style={{ top: at.top, bottom: at.bottom, right: at.right }}
            className="fixed z-50 w-52 rounded-lg border border-line bg-panel p-1.5 shadow-lg shadow-black/40"
          >
            {expiresAt === null ? (
              <p className="px-2 py-2 text-[13px] leading-relaxed text-ink-dim">
                This code already never expires. There is nothing to extend.
              </p>
            ) : (
              <>
                {PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    disabled={pending}
                    onClick={() => extend({ extendDays: days })}
                    className="block w-full rounded px-2 py-1.5 text-left text-[13px] text-ink hover:bg-panel-2 disabled:opacity-50"
                  >
                    Add {days} days
                  </button>
                ))}
                {/*
                  Any other number. The presets cover the common answers, but an operator
                  answering a real email sometimes needs "until the end of the quarter",
                  and a menu of four buttons cannot say that.
                */}
                <div className="my-1 border-t border-line" />
                <form
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const days = Number.parseInt(custom, 10)
                    if (!Number.isFinite(days) || days < 1) {
                      toast('Enter a number of days.', 'error')
                      return
                    }
                    extend({ extendDays: Math.min(days, MAX_CODE_VALIDITY_DAYS) })
                  }}
                >
                  <Input
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    inputMode="numeric"
                    placeholder="Days"
                    aria-label={`Days to add to ${code}`}
                    className="h-8 w-20 text-[13px]"
                  />
                  <Button type="submit" size="sm" disabled={pending || !custom.trim()}>
                    Add
                  </Button>
                </form>

                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => extend({ neverExpires: true })}
                  className="block w-full rounded px-2 py-1.5 text-left text-[13px] text-ink hover:bg-panel-2 disabled:opacity-50"
                >
                  Never expires
                </button>
                {/*
                  Said here rather than after the fact: an expired code that gets 7 days
                  gets them from today, and a code with a month left gets 7 on top.
                  Extending never takes time away.
                */}
                <p className="px-2 pb-1 pt-2 text-[12px] leading-relaxed text-ink-dim">
                  Counted from today if it has already lapsed, otherwise added on.
                </p>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
