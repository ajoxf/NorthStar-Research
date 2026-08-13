import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:translate-y-px whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-gold text-bg hover:bg-[#dcb32c] shadow-[0_1px_0_rgba(255,255,255,0.16)_inset]',
  secondary: 'border border-line bg-panel text-ink hover:border-gold/50 hover:bg-panel-2',
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
