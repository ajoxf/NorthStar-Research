'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { FileUp } from 'lucide-react'

import { explainUploadFailure } from '@/app/admin/reports/upload-failure'
import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { compressReportPdf } from '@/lib/pdf-compress'
import { EXPERT_REPORT_PREFIX, MAX_PDF_BYTES, REPORT_BLOB_PREFIX, formatBytes, slugify } from '@/lib/report-upload'

/**
 * Attach the edition PDF to a report that already exists, or replace the one it has.
 *
 * The screen this sits on has always warned that a report with no document leaves members
 * nothing to read, and told the operator to "upload the edition PDF below" — below a panel
 * that had no upload in it. The only upload on the site was on the create form, so a
 * report saved without a document could never be given one: the way out was to delete it
 * and start again, losing its section, its publish date and anything already written.
 *
 * The upload goes straight to Blob storage from the browser, exactly as the create form's
 * does, so the ~4.5 MB serverless body limit that made every real report fail to save does
 * not apply. Only the resulting URL passes through our API, where it is checked for the
 * right prefix and for actually being a PDF.
 */
/** Where each kind of editor's requests go: the desk's routes, or an expert's own narrower ones. */
const ROUTES = {
  admin: { token: '/api/admin/reports/upload', prefix: REPORT_BLOB_PREFIX, edit: (id: string) => `/api/admin/reports/${id}` },
  expert: { token: '/api/expert/reports/upload', prefix: EXPERT_REPORT_PREFIX, edit: (id: string) => `/api/expert/reports/${id}` },
} as const

export function PdfAttach({
  reportId,
  title,
  hasPdf,
  mode = 'admin',
}: {
  reportId: string
  /** Names the stored file, so the blob is recognisable in the store. */
  title: string
  hasPdf: boolean
  /** An expert attaching to their own submission uses their own upload token and edit route. */
  mode?: 'admin' | 'expert'
}) {
  const routes = ROUTES[mode]
  const router = useRouter()
  const toast = useToast()
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [stage, setStage] = React.useState<'compressing' | 'uploading' | null>(null)
  const [saving, setSaving] = React.useState<string | null>(null)
  // The same shrinking the upload form does, on by default and switchable for one file.
  const [compress, setCompress] = React.useState(true)

  async function attach(original: File) {
    setError(null)
    if (original.type !== 'application/pdf' && !original.name.toLowerCase().endsWith('.pdf')) {
      setError('Upload a PDF file.')
      return
    }
    if (original.size > MAX_PDF_BYTES) {
      setError(`That PDF is ${formatBytes(original.size)}, over the ${formatBytes(MAX_PDF_BYTES)} limit.`)
      return
    }
    setBusy(true)
    setProgress(0)
    setSaving(null)
    try {
      // Shrunk in the browser first, exactly as on upload. Never blocks: any failure inside
      // compressReportPdf hands back the original file.
      let file = original
      if (compress) {
        setStage('compressing')
        const result = await compressReportPdf(original, (done, total) => setProgress(total ? (done / total) * 100 : 0))
        file = result.file
        setSaving(result.skipped ? (result.reason ?? null) : `${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`)
      }
      setStage('uploading')
      setProgress(0)
      let blob
      try {
        blob = await upload(`${routes.prefix}${slugify(title)}.pdf`, file, {
          access: 'public',
          contentType: 'application/pdf',
          handleUploadUrl: routes.token,
          // Large files upload in parts, so a stalled connection resumes rather than
          // restarting a 15 MB transfer from zero.
          multipart: true,
          onUploadProgress: ({ percentage }) => setProgress(percentage),
        })
      } catch (uploadError) {
        const message = await explainUploadFailure(uploadError, routes.token)
        setError(message)
        toast(message, 'error')
        return
      }

      const response = await fetch(routes.edit(reportId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBlobUrl: blob.url, pdfBlobPathname: blob.pathname }),
      })
      // Parsed defensively: a failure from the platform rather than the app comes back as
      // HTML, and calling .json() on it would throw away the status entirely.
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data?.error ?? `The PDF could not be attached (HTTP ${response.status}).`
        setError(message)
        toast(message, 'error')
        return
      }

      toast(hasPdf ? 'Document replaced' : 'Document attached', 'success')
      router.refresh()
    } finally {
      setBusy(false)
      setStage(null)
      // Cleared so choosing the same file twice after a failure still fires onChange.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-line bg-panel p-5">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
        {hasPdf ? 'Replace the document' : 'Upload the document'}
      </h2>
      <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
        {hasPdf
          ? 'Uploading another PDF replaces what members read. The previous file is left in storage rather than removed.'
          : 'The member’s reader builds the whole reading experience from this file — the pages, and the charts lifted out of them.'}
      </p>

      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void attach(file)
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner /> : <FileUp className="h-4 w-4" aria-hidden />}
          {hasPdf ? 'Choose a replacement' : 'Choose a PDF'}
        </Button>
        {busy && (
          <span className="font-mono text-[12px] text-ink-dim">
            {stage === 'compressing'
              ? `Shrinking ${Math.round(progress)}%`
              : progress < 100
                ? `Uploading ${Math.round(progress)}%`
                : 'Saving…'}
          </span>
        )}
        {!busy && saving && <span className="font-mono text-[12px] text-ink-dim">{saving}</span>}
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-dim">
        <input type="checkbox" checked={compress} onChange={(event) => setCompress(event.target.checked)} disabled={busy} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent" />
        <span>
          <span className="text-ink">Shrink the charts before uploading</span> — resamples chart images to 1,400px. Text,
          pages and the reading view are untouched.
        </span>
      </label>

      {error && (
        <p className="mt-3 text-[15px] leading-relaxed text-down">{error}</p>
      )}
    </div>
  )
}
