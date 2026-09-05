import { z } from 'zod'

import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '@/lib/package-shape'

/**
 * Topics, authors and sections — the shapes, the names and the validation.
 *
 * Kept free of `server-only` imports so the rules can be tested directly. Everything that
 * decides what a member sees on a public page is decided here rather than inline in a
 * form, because two places deriving "Energy by Sarah Chen" slightly differently is how a
 * section ends up named one thing in the admin and another at checkout.
 */

/** Lowercase, hyphenated, URL-safe. Shared by topics, authors and sections. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    // Strip accents so "Zoë" and "Zoe" cannot become two different slugs.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * What a section is called, everywhere.
 *
 * Generated from its topic and author — "Energy by Sarah Chen" — unless the desk has
 * written something else. Generating it is the point: a section *is* a topic by an
 * author, and letting the name be typed independently means it can end up disagreeing
 * with the two things it is made of.
 */
export function sectionName(input: {
  displayName?: string | null
  topic: { name: string }
  author: { name: string }
}): string {
  const override = input.displayName?.trim()
  if (override) return override
  return `${input.topic.name} by ${input.author.name}`
}

/** The slug a new section gets by default: `energy-by-sarah-chen`. */
export function sectionSlug(topicName: string, authorName: string): string {
  return slugify(`${topicName} by ${authorName}`)
}

/**
 * The author line shown under a report title.
 *
 * Falls back to the name alone when there is no headline, rather than leaving a dangling
 * separator — an author with no biography yet should read as unfinished, not as broken.
 */
export function authorByline(author: { name: string; headline?: string | null }): string {
  const headline = author.headline?.trim()
  return headline ? `${author.name} — ${headline}` : author.name
}

/** Initials for the avatar placeholder, when an author has no photograph yet. */
export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Make a slug unique against what already exists, by suffixing.
 *
 * Two authors genuinely can share a name, and two topics can be renamed into collision.
 * Failing the save would be correct and useless; `sarah-chen-2` is neither pretty nor
 * wrong, and it keeps the operator moving.
 */
export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(desired)) return desired
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${desired}-${n}`
    if (!used.has(candidate)) return candidate
  }
  // A thousand collisions is not a naming problem any more.
  return `${desired}-${Date.now()}`
}

const name = z.string().trim().min(1, 'Give it a name.').max(80, 'That name is too long.')
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined))

/** A URL, or nothing. Rejects anything that is not http(s) so a link cannot be javascript:. */
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || /^https:\/\/|^http:\/\//.test(value),
    'Links must start with http:// or https://',
  )

export const topicInputSchema = z.object({
  name,
  blurb: optionalText(200),
  sortOrder: z.number().int().min(0).max(999).default(0),
})

export const authorInputSchema = z.object({
  name,
  headline: optionalText(140),
  bio: optionalText(4000),
  photoUrl: optionalUrl,
  websiteUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  xUrl: optionalUrl,
  /** One per line in the form; already split by the time it reaches here. */
  credentials: z.array(z.string().trim().min(1).max(120)).max(12, 'Twelve is plenty.').default([]),
})

export const sectionInputSchema = z.object({
  topicId: z.string().min(1, 'Choose a topic.'),
  authorId: z.string().min(1, 'Choose an author.'),
  displayName: optionalText(80),
  description: optionalText(600),
  priceCents: z
    .number()
    .int()
    .min(MIN_PRICE_CENTS, 'That price is too low.')
    .max(MAX_PRICE_CENTS, 'That price is too high.'),
  currency: z.string().trim().length(3).default('USD'),
  interval: z.enum(['month', 'year']).default('month'),
  sortOrder: z.number().int().min(0).max(999).default(0),
})

export type TopicInput = z.infer<typeof topicInputSchema>
export type AuthorInput = z.infer<typeof authorInputSchema>
export type SectionInput = z.infer<typeof sectionInputSchema>

/** One credential per line, blank lines dropped. Mirrors how package features are entered. */
export function parseCredentials(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
}
