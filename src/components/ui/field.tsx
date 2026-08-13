import * as React from 'react'

import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-line bg-panel-2 px-3.5 text-[15px] text-ink',
          'placeholder:text-ink-dim/60 transition-colors',
          'focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40',
          'disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-line bg-panel-2 px-3.5 py-3 text-[15px] leading-relaxed text-ink',
        'placeholder:text-ink-dim/60 transition-colors',
        'focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40',
        className,
      )}
      {...props}
    />
  )
})

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-[15px] text-ink',
        'focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40',
        className,
      )}
      {...props}
    />
  )
})

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim', className)}
      {...props}
    />
  )
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="mt-1.5 text-[13px] text-down">
      {children}
    </p>
  )
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{children}</p>
}
