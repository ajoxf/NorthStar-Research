import Link from 'next/link'

import { Wordmark } from '@/components/site-chrome'
import { ToastProvider } from '@/components/ui/toast'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="relative flex min-h-screen flex-col">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-30" aria-hidden />

        <header className="relative border-b border-line">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Wordmark />
            <Link href="/" className="text-sm text-ink-dim transition-colors hover:text-ink">
              Back to site
            </Link>
          </div>
        </header>

        <main className="relative flex flex-1 items-center justify-center px-5 py-14">{children}</main>

        <footer className="relative border-t border-line px-5 py-6 text-center">
          <p className="mx-auto max-w-2xl text-[11px] leading-relaxed text-ink-dim/70">
            Research is for educational and informational purposes only and is not financial advice.{' '}
            <Link href="/disclaimer" className="underline underline-offset-4 hover:text-ink-dim">
              Read the full disclaimer
            </Link>
            .
          </p>
        </footer>
      </div>
    </ToastProvider>
  )
}
