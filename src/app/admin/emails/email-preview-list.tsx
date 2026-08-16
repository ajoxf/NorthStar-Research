'use client'

import * as React from 'react'
import { Code2, Eye } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { EmailPreview } from '@/lib/notifications/previews'
import { cn } from '@/lib/utils'

/**
 * The rendered emails.
 *
 * Each one is shown inside an `<iframe srcDoc>` rather than injected into the page. Two
 * reasons, both load-bearing:
 *
 *   - The emails are a full dark HTML document with their own `<body>` styling. Dropped
 *     into the admin page they would inherit Tailwind's reset and stop resembling what
 *     lands in an inbox — which would defeat the point of previewing them.
 *   - The iframe is sandboxed **without `allow-scripts`**, so nothing inside a template
 *     can execute — no script tag, no inline handler, no `javascript:` href. The content
 *     is our own today, but a preview surface is exactly where interpolated member data
 *     would first get rendered, and that should be inert by construction rather than by
 *     review.
 *
 * `allow-same-origin` *is* granted, purely so the parent can read `scrollHeight` and size
 * the frame to its content. On its own that grant hands out nothing: with scripting
 * disabled there is no code inside the frame to make use of the origin.
 */
export function EmailPreviewList({ previews }: { previews: EmailPreview[] }) {
  return (
    <div className="space-y-10">
      {previews.map((preview) => (
        <PreviewCard key={preview.key} preview={preview} />
      ))}
    </div>
  )
}

function PreviewCard({ preview }: { preview: EmailPreview }) {
  const [view, setView] = React.useState<'html' | 'text'>('html')

  return (
    <section id={preview.key} className="scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[19px] text-ink">{preview.name}</h2>
        {preview.audience === 'desk' && <Badge tone="neutral">Internal — to the desk</Badge>}
      </div>

      <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-ink-dim">{preview.trigger}</p>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
          <div className="min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
              Subject
            </span>
            <p className="truncate text-[14px] text-ink">{preview.subject}</p>
          </div>

          {/*
            Plain text is not an afterthought: some clients render it instead of the HTML,
            and every template ships both. If the text version is wrong, it is wrong for
            somebody — so it gets a tab rather than being invisible here.
          */}
          <div className="flex shrink-0 gap-1 rounded border border-line p-0.5">
            <ViewTab active={view === 'html'} onClick={() => setView('html')} icon={Eye}>
              HTML
            </ViewTab>
            <ViewTab active={view === 'text'} onClick={() => setView('text')} icon={Code2}>
              Text
            </ViewTab>
          </div>
        </div>

        {view === 'html' ? (
          <EmailFrame title={`${preview.name} email preview`} html={preview.html} />
        ) : (
          <pre className="max-h-[520px] overflow-auto bg-black px-4 py-4 font-mono text-[12px] leading-relaxed text-ink-dim">
            {preview.text}
          </pre>
        )}
      </div>
    </section>
  )
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Eye
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] transition-colors',
        active ? 'bg-panel-2 text-ink' : 'text-ink-dim hover:text-ink',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </button>
  )
}

/** Roughly a phone's width, which is how most of these are read. */
const FRAME_WIDTH = 600
const MIN_HEIGHT = 320

function EmailFrame({ title, html }: { title: string; html: string }) {
  // Sized to its content. Without this the frame is either a fixed box that clips longer
  // emails or a tall one padded with dead space — and a preview that crops the footer
  // hides the one paragraph most likely to need a lawyer's eye.
  const ref = React.useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = React.useState(MIN_HEIGHT)

  const measure = React.useCallback(() => {
    // A failed read leaves the default height in place and the frame scrolls internally,
    // rather than the preview breaking.
    try {
      const doc = ref.current?.contentDocument
      if (!doc) return
      const measured = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0)
      if (measured > MIN_HEIGHT) setHeight(measured + 8)
    } catch {
      /* keep the default height */
    }
  }, [])

  // `load` alone is not enough: it fires before the document inside has been laid out, so
  // the first measurement comes back as the frame's own height and the email sits clipped.
  // Observing the frame's root element catches the real height, and catches it again when
  // a webfont lands or the window is resized and the text reflows.
  React.useEffect(() => {
    const doc = ref.current?.contentDocument
    const root = doc?.documentElement
    if (!root || typeof ResizeObserver === 'undefined') {
      measure()
      return
    }

    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => observer.disconnect()
  }, [measure, html])

  return (
    <div className="overflow-x-auto bg-black">
      <iframe
        ref={ref}
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin"
        width={FRAME_WIDTH}
        height={height}
        style={{ height }}
        className="mx-auto block w-[600px] max-w-none border-0"
        onLoad={measure}
      />
    </div>
  )
}
