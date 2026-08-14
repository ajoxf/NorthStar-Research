'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

type EditableReport = {
  id: string
  title: string
  summary: string | null
  publishDate: string
  htmlContent: string | null
  instruments: string
  published: boolean
  hasPdf: boolean
}

export function ReportAdminPanel({ report }: { report: EditableReport }) {
  const router = useRouter()
  const toast = useToast()

  const [saving, setSaving] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = React.useState(false)

  async function saveChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(form.get('title') ?? ''),
          summary: String(form.get('summary') ?? ''),
          publishDate: String(form.get('publishDate') ?? ''),
          htmlContent: String(form.get('htmlContent') ?? ''),
          instruments: String(form.get('instruments') ?? ''),
        }),
      })
      const data = await response.json()

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

  async function publish() {
    setPublishing(true)
    setConfirmPublish(false)

    try {
      const response = await fetch(`/api/admin/reports/${report.id}/publish`, { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        toast(data.error ?? 'Publishing failed.', 'error')
        return
      }

      const { sent, failed, skipped } = data.summary
      toast(
        `Published. ${sent} sent${failed ? `, ${failed} failed` : ''}${
          skipped ? `, ${skipped} already delivered` : ''
        }.`,
        failed ? 'error' : 'success',
      )
      router.refresh()
    } catch {
      toast('Publishing failed.', 'error')
    } finally {
      setPublishing(false)
    }
  }

  async function unpublish() {
    setPublishing(true)
    try {
      await fetch(`/api/admin/reports/${report.id}/publish`, { method: 'DELETE' })
      toast('Report hidden from members. Nothing was deleted.', 'info')
      router.refresh()
    } finally {
      setPublishing(false)
    }
  }

  return (
    <>
      <section className="mt-8 rounded-lg border border-line bg-panel p-6">
        <h2 className="mb-1 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
          {report.published ? 'Re-send' : 'Publish'}
        </h2>
        <p className="mb-5 text-[14px] leading-relaxed text-ink-dim">
          {report.published
            ? 'This report is live. Re-sending delivers only to active members who have not already received it — nobody gets a duplicate.'
            : 'Publishing makes this report visible to members and immediately emails every active member a link to it (plus WhatsApp for those who have opted in and verified their number).'}
        </p>

        {confirmPublish ? (
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-4">
            <p className="mb-4 text-[14px] text-ink">
              This sends to your entire active member list. Continue?
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={publish} disabled={publishing}>
                {publishing ? (
                  <>
                    <Spinner />
                    Sending…
                  </>
                ) : (
                  'Yes, publish and send'
                )}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmPublish(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setConfirmPublish(true)} disabled={publishing}>
              <Send className="h-4 w-4" aria-hidden />
              {report.published ? 'Re-send to active members' : 'Publish and send'}
            </Button>

            <Link
              href={`/reports/${report.id}`}
              className="font-mono text-[12px] text-accent hover:underline"
            >
              Preview as a member
            </Link>

            {report.published && (
              <Button variant="ghost" onClick={unpublish} disabled={publishing} className="ml-auto">
                Un-publish
              </Button>
            )}
          </div>
        )}
      </section>

      <form onSubmit={saveChanges} className="mt-5 rounded-lg border border-line bg-panel p-6">
        <h2 className="mb-5 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
          Edit content
        </h2>

        <div className="mb-4">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={report.title} required />
        </div>

        <div className="mb-4">
          <Label htmlFor="summary">Summary</Label>
          <Textarea id="summary" name="summary" rows={3} defaultValue={report.summary ?? ''} />
        </div>

        <div className="mb-4">
          <Label htmlFor="publishDate">Publish date</Label>
          <Input id="publishDate" name="publishDate" type="date" defaultValue={report.publishDate} />
        </div>

        <div className="mb-4">
          <Label htmlFor="htmlContent">Reading view content</Label>
          <Textarea
            id="htmlContent"
            name="htmlContent"
            rows={12}
            defaultValue={report.htmlContent ?? ''}
            className="font-mono text-[13px]"
          />
          <Hint>
            {report.hasPdf
              ? 'Generated from the PDF text on upload. Edit freely — this is what members read on mobile.'
              : 'This report has no PDF, so this content is the whole report.'}
          </Hint>
        </div>

        <div>
          <Label htmlFor="instruments">Instrument table (JSON)</Label>
          <Textarea
            id="instruments"
            name="instruments"
            rows={10}
            defaultValue={report.instruments}
            className="font-mono text-[13px]"
          />
          <Hint>Leave blank to hide the tabbed instrument view for this report.</Hint>
        </div>

        <FieldError>{error}</FieldError>

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Spinner />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </div>
      </form>
    </>
  )
}
