'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Upload } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { REPORT_TYPES } from '@/lib/report-content'

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

export function ReportUploadForm() {
  const router = useRouter()
  const toast = useToast()

  const [type, setType] = React.useState(REPORT_TYPES[0].value)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [instruments, setInstruments] = React.useState('')

  const today = new Date().toISOString().slice(0, 10)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/admin/reports', { method: 'POST', body: form })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'The report could not be saved.')
        toast(data.error ?? 'Upload failed.', 'error')
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
    } catch {
      setError('The report could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
      <div className="rounded-lg border border-line bg-panel p-6">
        <div className="mb-4">
          <Label htmlFor="type">Report type</Label>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            {REPORT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Hint>One of the four report types. Three are published in a typical week.</Hint>
        </div>

        <div className="mb-4">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required placeholder="Gold holds the weekly pivot" />
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

        <div>
          <Label htmlFor="publishDate">Publish date</Label>
          <Input id="publishDate" name="publishDate" type="date" defaultValue={today} required />
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
        <Hint>
          Stored so members can download it. It does not become the on-screen reading view —
          write that below, so the levels are exactly what you intend.
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
              Uploading…
            </>
          ) : (
            'Save as draft'
          )}
        </Button>
      </div>
    </form>
  )
}
