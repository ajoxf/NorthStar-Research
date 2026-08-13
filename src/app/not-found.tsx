import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold">Error 404</p>
        <h1 className="mt-4 text-3xl text-ink">We can&apos;t find that page</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
          The link may be broken, or the report may not be available to your account. If you followed
          a link from an email, sign in first and try again.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4 text-[14px]">
          <Link href="/" className="text-gold underline underline-offset-4">
            Return home
          </Link>
          <Link href="/login" className="text-gold underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
