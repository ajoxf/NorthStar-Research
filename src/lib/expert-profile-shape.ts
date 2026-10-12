/**
 * An expert's proposed profile edit, compared with what is live.
 *
 * Pure, so the comparison an admin approves from is tested on its own.
 */

import { isExpertPhotoUrl } from '@/lib/author-photo'
import { performanceClaim } from '@/lib/review-shape'

export type ProfileFields = {
  headline: string | null
  bio: string | null
  photoUrl: string | null
  credentials: string[]
  websiteUrl: string | null
  linkedinUrl: string | null
  xUrl: string | null
}

export const PROFILE_FIELD_LABELS: Record<keyof ProfileFields, string> = {
  headline: 'Headline',
  bio: 'Biography',
  photoUrl: 'Photograph',
  credentials: 'Credentials',
  websiteUrl: 'Website',
  linkedinUrl: 'LinkedIn',
  xUrl: 'X',
}

export type ProfileChange = { field: keyof ProfileFields; label: string; before: string | null; after: string | null }

function shown(field: keyof ProfileFields, fields: ProfileFields): string | null {
  if (field === 'credentials') return fields.credentials.length ? fields.credentials.join('\n') : null
  const value = fields[field]
  return value && value.trim() ? value : null
}

/** What the draft would change, field by field, in the order the profile shows them. */
export function profileChanges(live: ProfileFields, draft: ProfileFields): ProfileChange[] {
  return (Object.keys(PROFILE_FIELD_LABELS) as (keyof ProfileFields)[])
    .map((field) => ({ field, label: PROFILE_FIELD_LABELS[field], before: shown(field, live), after: shown(field, draft) }))
    .filter((change) => change.before !== change.after)
}

/**
 * A photograph an expert may propose: none, the one already live, or one they uploaded to
 * their own area. Not any URL — a pasted address could be a tracking pixel or somebody
 * else's picture, and the admin approving it would have no way to tell.
 */
export function acceptableExpertPhoto(url: string | null, livePhotoUrl: string | null): boolean {
  if (!url) return true
  if (url === livePhotoUrl) return true
  return isExpertPhotoUrl(url)
}

/** A warning for the admin when the text reads like a promise of returns. Null when it does not. */
export function profileClaim(draft: ProfileFields): string | null {
  return performanceClaim([draft.headline, draft.bio, ...draft.credentials].filter(Boolean).join('\n'))
}
