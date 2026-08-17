'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

const STATUSES = ['all', 'active', 'pending', 'expired', 'cancelled'] as const

/**
 * The filters compose into one segment rather than replacing each other.
 *
 * Every control merges into the same query string, so status AND source AND tag AND
 * engagement narrow together — "active, from crypto, tagged FX, never read anything" is
 * one question with one answer. Applying only the last-clicked control would silently
 * answer a different one.
 *
 * The segment lives entirely in the URL, which is what makes it shareable and
 * bookmarkable without a saved-segments feature existing yet.
 */
export function MemberFilters({
  status,
  query,
  tag,
  source,
  engagement,
  tagOptions,
  sourceOptions,
  engagementOptions,
}: {
  status: string
  query: string
  tag: string
  source: string
  engagement: string
  tagOptions: string[]
  sourceOptions: { value: string; label: string }[]
  engagementOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const [search, setSearch] = React.useState(query)

  function apply(next: { status?: string; q?: string; tag?: string; source?: string; engagement?: string }) {
    const params = new URLSearchParams()
    const merged = { status, q: search, tag, source, engagement, ...next }

    if (merged.status && merged.status !== 'all') params.set('status', merged.status)
    if (merged.q) params.set('q', merged.q)
    if (merged.tag) params.set('tag', merged.tag)
    if (merged.source && merged.source !== 'all') params.set('source', merged.source)
    if (merged.engagement && merged.engagement !== 'all') params.set('engagement', merged.engagement)

    router.push(`/admin/members${params.toString() ? `?${params}` : ''}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          apply({ q: search })
        }}
        className="relative flex-1"
      >
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search email, name or phone"
          aria-label="Search members"
          className="pl-10"
        />
      </form>

      <Select
        value={status}
        onChange={(event) => apply({ status: event.target.value })}
        aria-label="Filter by subscription status"
        className="sm:w-44"
      >
        {STATUSES.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? 'All statuses' : option}
          </option>
        ))}
      </Select>

      <Select
        value={source}
        onChange={(event) => apply({ source: event.target.value })}
        aria-label="Filter by how they joined"
        className="sm:w-44"
      >
        {sourceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Select
        value={engagement}
        onChange={(event) => apply({ engagement: event.target.value })}
        aria-label="Filter by engagement"
        className="sm:w-44"
      >
        {engagementOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      {tagOptions.length > 0 && (
        <Select
          value={tag}
          onChange={(event) => apply({ tag: event.target.value })}
          aria-label="Filter by tag"
          className="sm:w-40"
        >
          <option value="">All tags</option>
          {tagOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      )}

      <Button
        variant="secondary"
        onClick={() => {
          // Exports exactly what is filtered, so a segment can be handed to an ESP as-is.
          // Exports the whole segment, not just the status — otherwise the CSV silently
          // contains more people than the screen showed, which is how the wrong list gets
          // emailed.
          const params = new URLSearchParams()
          if (status !== 'all') params.set('status', status)
          if (source !== 'all') params.set('source', source)
          if (engagement !== 'all') params.set('engagement', engagement)
          if (tag) params.set('tag', tag)
          if (search) params.set('q', search)
          window.location.href = `/api/admin/members/export${params.toString() ? `?${params}` : ''}`
        }}
      >
        <Download className="h-4 w-4" aria-hidden />
        Export CSV
      </Button>
    </div>
  )
}
