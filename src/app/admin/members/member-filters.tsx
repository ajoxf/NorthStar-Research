'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

const STATUSES = ['all', 'active', 'pending', 'expired', 'cancelled'] as const

export function MemberFilters({
  status,
  query,
  tag,
  tagOptions,
}: {
  status: string
  query: string
  tag: string
  tagOptions: string[]
}) {
  const router = useRouter()
  const [search, setSearch] = React.useState(query)

  function apply(next: { status?: string; q?: string; tag?: string }) {
    const params = new URLSearchParams()
    const merged = { status, q: search, tag, ...next }

    if (merged.status && merged.status !== 'all') params.set('status', merged.status)
    if (merged.q) params.set('q', merged.q)
    if (merged.tag) params.set('tag', merged.tag)

    router.push(`/admin/members${params.toString() ? `?${params}` : ''}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          const params = new URLSearchParams()
          if (status !== 'all') params.set('status', status)
          window.location.href = `/api/admin/members/export${params.toString() ? `?${params}` : ''}`
        }}
      >
        <Download className="h-4 w-4" aria-hidden />
        Export CSV
      </Button>
    </div>
  )
}
