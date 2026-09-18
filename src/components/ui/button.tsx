import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'on-light' | 'on-light-solid'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:translate-y-px whitespace-nowrap'

const variants: Record<Variant, string> = {
  // Flat accent fill, page-coloured label. The reference uses no glow — the colour
  // carries it. Both the fill and its hover come from tokens, so a re-skinned subtree
  // gets a button that hovers in its own colour rather than flashing lime.
  primary: 'bg-accent text-bg font-semibold hover:bg-accent-hover',
  // Outlined pill on transparent, the reference's secondary action.
  secondary: 'border border-ink/25 bg-transparent text-ink hover:border-ink/60 hover:bg-ink/5',
  /*
   * The same two actions, for a light band.
   *
   * `secondary` draws itself in `ink`, which is white — correct on black and invisible on
   * the grey grounds the page now alternates onto. Rather than let each call site hand-roll
   * a colour and get it wrong once, the two light-ground pairs live here beside the dark
   * ones, so choosing a button is choosing a ground.
   */
  'on-light':
    'border border-ink-on-light/25 bg-transparent text-ink-on-light hover:border-ink-on-light/60 hover:bg-ink-on-light/5',
  'on-light-solid': 'bg-ink-on-light text-white font-semibold hover:bg-ink-on-light/90',
  ghost: 'text-ink-dim hover:text-ink hover:bg-panel',
  danger: 'border border-down/40 bg-transparent text-down hover:bg-down/10',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}

export function ButtonLink({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...props} />
}

/** Inline spinner for pending states — never freeze the UI without feedback. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  )
}
