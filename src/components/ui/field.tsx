import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Form controls, on either ground.
 *
 * Every control here used to draw itself for the dark page: `bg-panel-2` behind
 * `text-ink`, which is white. On the light bands the site now alternates onto — and
 * especially inside a white card — that is white text in a black box, or worse, white
 * text a buyer has typed and cannot read.
 *
 * So the ground is a prop, exactly as it is for {@link Band} and the button variants,
 * rather than a set of overriding classes hand-rolled at each call site. A control cannot
 * see its own background; being told is the only reliable way it gets this right.
 */
export type FieldTone = 'dark' | 'light'

const FIELD: Record<FieldTone, string> = {
  dark: 'border-line bg-panel-2 text-ink placeholder:text-ink-dim/60 focus:border-accent/60 focus:ring-accent/40',
  light:
    'border-ink-on-light/20 bg-white text-ink-on-light placeholder:text-ink-on-light-dim/60 focus:border-ink-on-light/50 focus:ring-ink-on-light/20',
}

const MUTED: Record<FieldTone, string> = {
  dark: 'text-ink-dim',
  light: 'text-ink-on-light-dim',
}

type ToneProp = { tone?: FieldTone }

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & ToneProp
>(function Input({ className, tone = 'dark', ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border px-3.5 text-[15px] transition-colors',
        'focus:outline-none focus:ring-1',
        'disabled:opacity-50',
        FIELD[tone],
        className,
      )}
      {...props}
    />
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & ToneProp
>(function Textarea({ className, tone = 'dark', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border px-3.5 py-3 text-[15px] leading-relaxed transition-colors',
        'focus:outline-none focus:ring-1',
        FIELD[tone],
        className,
      )}
      {...props}
    />
  )
})

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & ToneProp
>(function Select({ className, tone = 'dark', ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border px-3 text-[15px]',
        'focus:outline-none focus:ring-1',
        FIELD[tone],
        className,
      )}
      {...props}
    />
  )
})

export function Label({
  className,
  tone = 'dark',
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & ToneProp) {
  return (
    <label
      className={cn(
        'mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em]',
        MUTED[tone],
        className,
      )}
      {...props}
    />
  )
}

export function FieldError({ children, tone = 'dark' }: { children?: React.ReactNode } & ToneProp) {
  if (!children) return null
  return (
    <p
      role="alert"
      className={cn('mt-1.5 text-[13px]', tone === 'light' ? 'text-down-on-light' : 'text-down')}
    >
      {children}
    </p>
  )
}

export function Hint({ children, tone = 'dark' }: { children: React.ReactNode } & ToneProp) {
  return <p className={cn('mt-1.5 text-[13px] leading-relaxed', MUTED[tone])}>{children}</p>
}
