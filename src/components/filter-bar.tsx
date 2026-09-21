'use client'

import * as React from 'react'
import { Check, SlidersHorizontal, X } from 'lucide-react'

import {
  browseFilterActive,
  toggleValue,
  type BrowseFilterState,
  type BrowseSort,
} from '@/lib/browse-filter'
import { formatPrice } from '@/lib/package-shape'
import { cn } from '@/lib/utils'

/**
 * The controls a visitor narrows a list with, on either ground.
 *
 * Controlled: it owns no state, so the page it sits on can hold the filter, apply it to
 * its own cards, and say how many survived. Three surfaces use it and none of them share
 * a card shape, so the alternative — a component that both filters and renders — would
 * have meant three of these.
 *
 * **A dimension with nothing to choose between is not rendered.** One author, or one
 * subject, means a control whose every option returns the same list; showing it teaches a
 * visitor that the filters do nothing. This is also why `priceCeilings` derives its bands
 * from the real range rather than hard-coding them.
 *
 * Closed by default, behind a Filters button. Open, this is five rows of chips sitting
 * above the thing somebody came to look at, and a visitor who wants to browse should not
 * have to scroll past the machinery for narrowing a list they have not seen yet. What
 * stays visible when closed is the count of active dimensions, how many rows survived and
 * the way to clear — enough that a narrowed grid is never unexplained.
 */
export function FilterBar({
  tone = 'light',
  subjects,
  authors,
  ceilings,
  trialCount,
  currency,
  value,
  onChange,
  resultCount,
  totalCount,
}: {
  tone?: 'light' | 'dark'
  /** Every subject present in the unfiltered list. */
  subjects: string[]
  /** Every author present, as slug and name. */
  authors: { slug: string; name: string }[]
  /** Price ceilings worth offering, in minor units. */
  ceilings: number[]
  /** How many rows have a trial open. Zero hides the control entirely. */
  trialCount: number
  currency: string
  value: BrowseFilterState
  onChange: (next: BrowseFilterState) => void
  resultCount: number
  totalCount: number
}) {
  const light = tone === 'light'
  const active = browseFilterActive(value)

  /*
   * Closed until asked for.
   *
   * Every dimension open at once is a wall of chips above the thing somebody came to look
   * at — on /coverage it pushed the first subject most of a screen down the page. A
   * visitor who wants to browse should not have to scroll past the machinery for
   * narrowing a list they have not seen yet.
   *
   * It opens on click rather than on hover, and stays open until closed: a panel that
   * collapsed after each choice would make selecting three filters three round trips.
   */
  const [open, setOpen] = React.useState(false)
  const panelId = React.useId()

  /** How many dimensions are narrowing. Shown on the closed button, not the chip count. */
  const activeCount =
    (value.subjects.length > 0 ? 1 : 0) +
    (value.authors.length > 0 ? 1 : 0) +
    (value.maxPriceCents !== null ? 1 : 0) +
    (value.trialOnly ? 1 : 0)

  // Nothing to narrow: one subject, one author, one price, no trials. Render nothing.
  const anyDimension =
    subjects.length > 1 || authors.length > 1 || ceilings.length > 0 || trialCount > 0
  if (!anyDimension) return null

  const chip = (selected: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors',
      selected
        ? light
          ? 'border-ink-on-light bg-ink-on-light text-paper'
          : 'border-accent bg-accent text-ink-on-light'
        : light
          ? 'border-ink-on-light/20 text-ink-on-light hover:border-ink-on-light/45'
          : 'border-line text-ink hover:border-accent/45',
    )

  const groupLabel = cn(
    'font-mono text-[10px] uppercase tracking-[0.14em]',
    light ? 'text-ink-on-light-dim' : 'text-ink-dim',
  )

  return (
    <div className="mt-8">
      {/*
        The control, and — when the list is narrowed — what it is narrowed to.

        The summary stays visible while the panel is closed, because a grid showing four of
        twelve with no visible reason reads as a page that has lost most of its content.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((was) => !was)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors',
            light
              ? 'border-ink-on-light/20 text-ink-on-light hover:border-ink-on-light/45'
              : 'border-line text-ink hover:border-accent/45',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters
          {activeCount > 0 && (
            <span
              className={cn(
                'ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px]',
                light ? 'bg-ink-on-light text-paper' : 'bg-accent text-ink-on-light',
              )}
            >
              {activeCount}
            </span>
          )}
        </button>

        {active && (
          <>
            <span className={cn('text-[13px]', light ? 'text-ink-on-light-dim' : 'text-ink-dim')}>
              {resultCount === 0
                ? 'Nothing matches all of those.'
                : `Showing ${resultCount} of ${totalCount}.`}
            </span>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 text-[13px] underline underline-offset-4',
                light ? 'text-ink-on-light' : 'text-ink',
              )}
              onClick={() =>
                onChange({
                  subjects: [],
                  authors: [],
                  maxPriceCents: null,
                  trialOnly: false,
                  // The sort is the visitor's, not the filter's: clearing what is hidden
                  // should not also reorder what is left.
                  sort: value.sort,
                })
              }
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          </>
        )}
      </div>

      {/*
        Unmounted rather than hidden while closed.

        `display:none` would leave every chip in the accessibility tree and in the tab
        order, so a keyboard or screen-reader visitor would walk through a panel that,
        as far as anybody else is concerned, is not on the page.
      */}
      {!open ? null : (
      <div
        id={panelId}
        className={cn(
          'mt-3 rounded-2xl border p-5',
          light ? 'border-ink-on-light/12 bg-paper-card' : 'border-line bg-panel-2',
        )}
      >
      <div className="flex flex-col gap-5">
        {subjects.length > 1 && (
          <div>
            <p className={groupLabel}>Subject</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {subjects.map((subject) => {
                const on = value.subjects.includes(subject)
                return (
                  <button
                    key={subject}
                    type="button"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() =>
                      onChange({ ...value, subjects: toggleValue(value.subjects, subject) })
                    }
                  >
                    {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                    {subject}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {authors.length > 1 && (
          <div>
            <p className={groupLabel}>Author</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {authors.map((author) => {
                const on = value.authors.includes(author.slug)
                return (
                  <button
                    key={author.slug}
                    type="button"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() =>
                      onChange({ ...value, authors: toggleValue(value.authors, author.slug) })
                    }
                  >
                    {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                    {author.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          {ceilings.length > 0 && (
            <div>
              <p className={groupLabel}>Price</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ceilings.map((ceiling) => {
                  const on = value.maxPriceCents === ceiling
                  return (
                    <button
                      key={ceiling}
                      type="button"
                      aria-pressed={on}
                      className={chip(on)}
                      // Single-select: a second ceiling would only ever mean the higher of
                      // the two, so clicking the active one clears it instead.
                      onClick={() => onChange({ ...value, maxPriceCents: on ? null : ceiling })}
                    >
                      {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                      Under {formatPrice(ceiling, currency)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Offered only when something is actually on trial — a control that can only
              ever empty the list is worse than no control. */}
          {trialCount > 0 && (
            <div>
              <p className={groupLabel}>Availability</p>
              <div className="mt-2.5">
                <button
                  type="button"
                  aria-pressed={value.trialOnly}
                  className={chip(value.trialOnly)}
                  onClick={() => onChange({ ...value, trialOnly: !value.trialOnly })}
                >
                  {value.trialOnly && <Check className="h-3.5 w-3.5" aria-hidden />}
                  Free trial available
                </button>
              </div>
            </div>
          )}

          <div>
            <p className={groupLabel}>Sort</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(
                [
                  [null, 'Featured order'],
                  ['price-asc', 'Price: low to high'],
                  ['price-desc', 'Price: high to low'],
                ] as [BrowseSort, string][]
              ).map(([sort, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={value.sort === sort}
                  className={chip(value.sort === sort)}
                  onClick={() => onChange({ ...value, sort })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
      </div>
      )}
    </div>
  )
}
