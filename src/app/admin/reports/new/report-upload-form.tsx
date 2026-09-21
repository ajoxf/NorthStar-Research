'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Upload } from 'lucide-react'

import { upload } from '@vercel/blob/client'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { compressReportPdf } from '@/lib/pdf-compress'
import { explainUploadFailure } from '@/app/admin/reports/upload-failure'
import { MAX_PDF_BYTES, REPORT_BLOB_PREFIX, formatBytes, slugify } from '@/lib/report-upload'

/** Starter JSON so an admin can see the shape of the instrument table without docs. */
const INSTRUMENT_TEMPLATE = JSON.stringify(
  [
    {
      symbol: 'XAUUSD',
      name: 'Gold',
      last: '2,341.60',
      change: '-0.61%',
      bias: 'down',
      rows: [
        { label: 'Weekly bias', value: 'Corrective', bias: 'down' },
        { label: 'Primary resistance', value: '2,372 / 2,401' },
        { label: 'Primary support', value: '2,318 / 2,286' },
        { label: 'Invalidation', value: 'Reclaim of 2,401 on volume', bias: 'up' },
      ],
      commentary: 'Optional paragraph shown under the table.',
    },
  ],
  null,
  2,
)

export function ReportUploadForm({
  sections,
}: {
  /** Every section on sale, so the edition can be filed as it is uploaded. */
  sections: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()

  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [instruments, setInstruments] = React.useState('')
  /** Null until work starts. A 15 MB file is a wait worth showing. */
  const [progress, setProgress] = React.useState<number | null>(null)
  const [stage, setStage] = React.useState<'compressing' | 'uploading' | null>(null)
  /** What compression achieved, reported once it has run. */
  const [saving, setSaving] = React.useState<{ note: string; saved?: number } | null>(null)
  /*
   * On by default, but visible and switchable.
   *
   * It changes the file members download, so it is not something to do silently. An
   * operator publishing a report where fine chart detail genuinely matters can turn it
   * off for that one upload.
   */
  const [compress, setCompress] = React.useState(true)

  const today = new Date().toISOString().slice(0, 10)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    setProgress(null)
    setStage(null)
    setSaving(null)

    const form = new FormData(event.currentTarget)

    try {
      /*
       * The PDF goes browser → Vercel Blob directly, and only its resulting URL is sent
       * to our own API.
       *
       * It used to be posted to /api/admin/reports as part of this form, which capped the
       * whole thing at Vercel's ~4.5 MB serverless request body limit. A real report runs
       * to tens of megabytes, so uploads failed at the platform edge with a response that
       * was not JSON — and the `await response.json()` below threw, which is why the only
       * thing the operator ever saw was the generic "could not be saved".
       */
      const file = form.get('pdf')
      form.delete('pdf')

      if (file instanceof File && file.size > 0) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
          setError('Upload a PDF file.')
          return
        }

        if (file.size > MAX_PDF_BYTES) {
          setError(
            `That PDF is ${formatBytes(file.size)}, over the ${formatBytes(MAX_PDF_BYTES)} limit.`,
          )
          return
        }

        /*
         * Shrunk here, in the browser, before a byte is sent.
         *
         * A report is almost entirely chart images exported far larger than any screen
         * shows them. Storage accrues forever and egress is multiplied by every member who
         * opens the report, so the download size is the bulk of what this costs to run.
         *
         * It is not required — uploads go straight to Blob and have no meaningful size
         * limit — which is exactly why it can never be allowed to block one. Every failure
         * inside `compressReportPdf` returns the original file.
         */
        let toUpload = file
        if (compress) {
          setStage('compressing')
          setProgress(0)
          const result = await compressReportPdf(file, (done, total) =>
            setProgress(total ? (done / total) * 100 : 0),
          )
          toUpload = result.file
          setSaving(
            result.skipped
              ? { note: result.reason ?? 'Uploaded as it is.' }
              : {
                  note: `${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`,
                  saved: 1 - result.compressedBytes / result.originalBytes,
                },
          )
        }

        setStage('uploading')
        setProgress(0)
        let blob
        try {
          blob = await upload(`${REPORT_BLOB_PREFIX}${slugify(String(form.get('title')))}.pdf`, toUpload, {
            access: 'public',
            contentType: 'application/pdf',
            handleUploadUrl: '/api/admin/reports/upload',
            // Large files upload in parts, so a stalled connection resumes rather than
            // restarting a 15 MB transfer from zero.
            multipart: true,
            onUploadProgress: ({ percentage }) => setProgress(percentage),
          })
        } catch (uploadError) {
          // Blob reports any token problem as "Failed to retrieve the client token",
          // which tells an operator nothing about what to fix. Ask our own endpoint for
          // the real reason — it knows whether storage is unconfigured, the session has
          // expired, or the file was refused.
          setError(await explainUploadFailure(uploadError))
          return
        }

        form.set('pdfBlobUrl', blob.url)
        form.set('pdfBlobPathname', blob.pathname)
        setProgress(100)
      }

      const response = await fetch('/api/admin/reports', { method: 'POST', body: form })
      // Parsed defensively: a failure from the platform rather than the app comes back as
      // HTML, and calling .json() on it would throw away the status entirely.
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          data?.error ?? `The report could not be saved (HTTP ${response.status}).`
        setError(message)
        toast(message, 'error')
        return
      }

      // Extraction problems are surfaced, not swallowed — an admin needs to know the
      // reading view came out empty before they publish it to the whole list.
      if (data.warning) {
        toast(data.warning, 'info')
      } else {
        toast('Report saved as a draft', 'success')
      }

      router.push(`/admin/reports/${data.reportId}`)
      router.refresh()
    } catch (err) {
      // Includes upload failures, which now carry a real reason from Blob rather than
      // being flattened into one unhelpful sentence.
      setError(err instanceof Error ? err.message : 'The report could not be saved.')
    } finally {
      setPending(false)
      setProgress(null)
      setStage(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
      <div className="rounded-lg border border-line bg-panel p-6">
        {/*
          No report-type picker. The desk numbers its own editions in the title, so a
          fixed four-way category was a field to get past rather than a decision worth
          making — and a wrong pick showed on the member's card for good.
        */}
        <div className="mb-4">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            placeholder="Issue 12 — Gold holds the weekly pivot"
          />
          <Hint>Whatever the members should see. Include the issue number if you use one.</Hint>
        </div>

        <div className="mb-4">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            name="summary"
            rows={3}
            maxLength={600}
            placeholder="One or two sentences. Shown on the dashboard card and in the notification email."
          />
        </div>

        <div className="mb-4">
          <Label htmlFor="shareHook">Share hook</Label>
          <Input
            id="shareHook"
            name="shareHook"
            maxLength={200}
            placeholder="Dollar, gold, silver and oil — all four turning at once."
          />
          <Hint>
            One line for people who are not members yet — it leads the WhatsApp share. Blank
            is fine; the title is used instead. Can be written later.
          </Hint>
        </div>

        <div className="mb-4">
          <Label htmlFor="publishDate">Publish date</Label>
          <Input id="publishDate" name="publishDate" type="date" defaultValue={today} required />
        </div>

        {/*
          Filed as it is uploaded, rather than afterwards on the edit screen.

          The section decides who may read the edition, so leaving it until later means
          every report exists for a while as all-access — and the one that gets published
          in that window reaches the wrong list. Blank is still a real answer, and the
          default: an untagged report is an all-access report, which is what every
          edition published before sections existed is.
        */}
        <div>
          <Label htmlFor="sectionId">Section</Label>
          {sections.length > 0 ? (
            <>
              <Select id="sectionId" name="sectionId" defaultValue="">
                <option value="">All-access only — no section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </Select>
              <Hint>
                Who can read this edition: the members who bought this section, plus every
                all-access member. Leave it blank and only all-access members can read it.
                Changeable later.
              </Hint>
            </>
          ) : (
            <Hint>
              No sections have been set up yet, so this report will be all-access — readable
              by every member, exactly as reports were before contributors existed.
            </Hint>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel p-6">
        <Label htmlFor="pdf">PDF</Label>
        <label
          htmlFor="pdf"
          className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-panel-2 px-5 py-8 text-center transition-colors hover:border-accent/50"
        >
          <Upload className="mb-3 h-5 w-5 text-ink-dim" aria-hidden />
          <span className="text-[14px] text-ink">
            {fileName ?? 'Choose the report PDF'}
          </span>
          <span className="mt-1 font-mono text-[11px] text-ink-dim">PDF only</span>
          <input
            id="pdf"
            name="pdf"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={compress}
            onChange={(event) => setCompress(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
          />
          <span className="text-[13px] leading-relaxed text-ink-dim">
            <span className="text-ink">Shrink the charts before uploading</span> — resamples chart
            images to 1,400px. Text, pages and the reading view are untouched. Typically about
            75% smaller with no visible difference, even zoomed in.
          </span>
        </label>

        {progress !== null && (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full bg-accent transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-dim">
              {stage === 'compressing'
                ? `Shrinking charts… ${Math.round(progress)}%`
                : progress < 100
                  ? `Uploading… ${Math.round(progress)}%`
                  : 'Upload complete'}
            </p>
          </div>
        )}

        {saving && (
          <p className="mt-2 font-mono text-[11px] text-up">
            {saving.saved !== undefined
              ? `${saving.note} — ${Math.round(saving.saved * 100)}% smaller`
              : saving.note}
          </p>
        )}

        <Hint>
          Stored so members can download it. It does not become the on-screen reading view —
          write that below, so the levels are exactly what you intend. Uploads go straight to
          storage, so a full-size report — tens of megabytes — is fine.
        </Hint>
      </div>

      <div className="rounded-lg border border-line bg-panel p-6">
        <div className="mb-4">
          <Label htmlFor="htmlContent">Reading view content</Label>
          <Textarea
            id="htmlContent"
            name="htmlContent"
            rows={8}
            placeholder="<p>Leave blank to generate this from the PDF text.</p>"
            className="font-mono text-[13px]"
          />
          <Hint>
            This is what members actually read on a phone. Basic HTML: headings, paragraphs,
            lists, tables, links. You can edit it after upload, but a report published without
            it shows only a download link.
          </Hint>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="instruments" className="mb-0">
              Instrument table (JSON)
            </Label>
            <button
              type="button"
              onClick={() => setInstruments(INSTRUMENT_TEMPLATE)}
              className="font-mono text-[11px] text-accent hover:underline"
            >
              Insert template
            </button>
          </div>
          <Textarea
            id="instruments"
            name="instruments"
            rows={10}
            value={instruments}
            onChange={(event) => setInstruments(event.target.value)}
            placeholder="Optional. Powers the tabbed instrument view at the top of the report."
            className="font-mono text-[13px]"
          />
          <Hint>Optional. Each entry becomes a tab in the reader.</Hint>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-down/40 bg-down/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-hidden />
          <FieldError>{error}</FieldError>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              {stage === 'compressing' ? 'Shrinking…' : 'Uploading…'}
            </>
          ) : (
            'Save as draft'
          )}
        </Button>
      </div>
    </form>
  )
}
