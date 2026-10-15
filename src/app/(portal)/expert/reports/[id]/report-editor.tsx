'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type EditableReport = {
  id: string
  title: string
  summary: string | null
  shareHook: string | null
  publishDate: string
  htmlContent: string | null
  instruments: string
  sectionId: string | null
  status: 'pending' | 'rejected'
}

/**
 * The expert's edit of their own submission: every field the desk can change after an
 * upload, saved through the same checks. Sending for review again is a separate, explicit
 * step for a report that was sent back.
 */
export function ReportEditor({ report, sections }: { report: EditableReport; sections: { id: string; name: string }[] }) {
  const router = useRouter()
  const toast = useToast()
  const [saving, setSaving] = React.useState(false)
  const [action, setAction] = React.useState<'resubmit' | 'withdraw' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/expert/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(form.get('title') ?? ''),
          summary: String(form.get('summary') ?? ''),
          shareHook: String(form.get('shareHook') ?? ''),
          publishDate: String(form.get('publishDate') ?? ''),
          htmlContent: String(form.get('htmlContent') ?? ''),
          instruments: String(form.get('instruments') ?? ''),
          sectionId: String(form.get('sectionId') ?? '') || null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? 'Changes could not be saved.')
        return
      }
      toast('Changes saved', 'success')
      router.refresh()
    } catch {
      setError('Changes could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function act(kind: 'resubmit' | 'withdraw') {
    if (kind === 'withdraw' && !window.confirm('Withdraw this report? The team will not publish it.')) return
    setAction(kind)
    const response = await fetch(`/api/expert/reports/${report.id}/${kind}`, { method: 'POST' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setAction(null)
    if (!response?.ok) return toast(data?.error ?? 'That did not work. Try again.', 'error')
    toast(kind === 'resubmit' ? 'Sent for review again' : 'Withdrawn', 'success')
    router.push('/expert#reports')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} noValidate className="rounded-lg border border-line bg-panel p-6">
        <h2 className="eyebrow mb-5">Details</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={report.title} required />
          </div>
          <div>
            <Label htmlFor="sectionId">Section</Label>
            <Select id="sectionId" name="sectionId" defaultValue={report.sectionId ?? ''}>
              {!report.sectionId && <option value="">Choose one of your sections</option>}
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="summary">Summary</Label>
            <Textarea id="summary" name="summary" rows={3} maxLength={600} defaultValue={report.summary ?? ''} />
            <Hint>Shown on the dashboard card and in the notification email.</Hint>
          </div>
          <div>
            <Label htmlFor="shareHook">Share hook</Label>
            <Input id="shareHook" name="shareHook" maxLength={200} defaultValue={report.shareHook ?? ''} />
            <Hint>One line for people who are not members yet — it leads the WhatsApp share. Blank uses the title.</Hint>
          </div>
          <div>
            <Label htmlFor="publishDate">Publish date</Label>
            <Input id="publishDate" name="publishDate" type="date" defaultValue={report.publishDate} />
          </div>
          <div>
            <Label htmlFor="htmlContent">Reading view content</Label>
            <Textarea id="htmlContent" name="htmlContent" rows={10} defaultValue={report.htmlContent ?? ''} className="font-mono text-[15px]" />
            <Hint>What members read on a phone. Basic HTML: headings, paragraphs, lists, tables, links.</Hint>
          </div>
          <div>
            <Label htmlFor="instruments">Instrument table (JSON)</Label>
            <Textarea id="instruments" name="instruments" rows={8} defaultValue={report.instruments} className="font-mono text-[15px]" />
            <Hint>Optional. Each entry becomes a tab in the reader.</Hint>
          </div>
        </div>
        <FieldError>{error}</FieldError>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving && <Spinner />}
            Save changes
          </Button>
          <Link
            href={`/reports/${report.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[14px] text-ink hover:border-accent/50"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Preview as members see it
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        {report.status === 'rejected' && (
          <Button onClick={() => act('resubmit')} disabled={action !== null}>
            {action === 'resubmit' && <Spinner />}
            Send for review again
          </Button>
        )}
        {report.status === 'pending' && (
          <Button variant="secondary" onClick={() => act('withdraw')} disabled={action !== null}>
            {action === 'withdraw' && <Spinner />}
            Withdraw
          </Button>
        )}
      </div>
    </div>
  )
}
