'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Hint, Label, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * File every unfiled report into one section.
 *
 * Only shown while there is something to file and somewhere to put it, so it disappears
 * once the back catalogue has an owner rather than sitting on the page forever as a
 * button with nothing to do.
 */
export function BackfillSections({
  untagged,
  sections,
}: {
  /** How many reports currently have no section. */
  untagged: number
  sections: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [sectionId, setSectionId] = React.useState('')
  const [pending, setPending] = React.useState(false)

  if (untagged === 0 || sections.length === 0) return null

  const chosen = sections.find((section) => section.id === sectionId)

  async function assign() {
    if (!chosen) return
    if (
      !confirm(
        `File ${untagged} unfiled report${untagged === 1 ? '' : 's'} into "${chosen.name}"?\n\n` +
          'Nobody loses access — all-access members can already read them. Reports that are ' +
          'already filed are not touched.',
      )
    ) {
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/admin/reports/assign-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: chosen.id, expected: untagged }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `Could not file them (HTTP ${response.status}).`, 'error')
        return
      }
      toast(`${data.moved} report${data.moved === 1 ? '' : 's'} filed into ${chosen.name}`, 'success')
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-accent/30 bg-accent/[0.06] p-5">
      <h2 className="text-[15px] text-ink">
        {untagged} report{untagged === 1 ? '' : 's'} {untagged === 1 ? 'has' : 'have'} no section
      </h2>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-dim">
        Only all-access members can read these, so they are not part of anything a
        contributor sells. Filing them into a section adds the members who bought that
        section to the people who can read them — nobody loses access, and any one of them
        can still be moved from its own edit screen afterwards.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Label htmlFor="backfill-section">File them all into</Label>
          <Select
            id="backfill-section"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
          >
            <option value="">Choose a section…</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </Select>
          <Hint>Reports that already have a section are left exactly as they are.</Hint>
        </div>

        <Button onClick={assign} disabled={pending || !chosen}>
          {pending && <Spinner />}
          {pending ? 'Filing…' : `File ${untagged} report${untagged === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
