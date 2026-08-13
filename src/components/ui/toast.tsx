'use client'

import * as React from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; tone: ToastTone }

const ToastContext = React.createContext<(message: string, tone?: ToastTone) => void>(() => {})

export function useToast() {
  return React.useContext(ToastContext)
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const tones: Record<ToastTone, string> = {
  success: 'border-up/40 text-up',
  error: 'border-down/40 text-down',
  info: 'border-line text-ink',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const push = React.useCallback((message: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4500)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.tone]
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-lg border bg-panel px-4 py-3',
                'text-sm shadow-lg shadow-black/40',
                tones[toast.tone],
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-ink">{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
