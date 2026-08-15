import { z } from 'zod'

/**
 * The email field, in one place.
 *
 * Every email input in the product used to be `z.string().email()`, which rejects
 * ` sam@example.com` — a leading or trailing space — with a validation error. That is not
 * a rare typo: password managers, autofill and copy-paste from another app all produce
 * it routinely, and iOS keyboards add a trailing space after an autocorrect.
 *
 * The routes each called `.trim()` on the value *after* parsing, which is too late: Zod
 * has already refused it. So the trim happens here, inside the schema, before the email
 * check runs.
 *
 * It is shared rather than repeated because the bug was in seven separate copies of the
 * same line — including both checkout routes, where it silently cost sales. The eighth
 * copy should not be able to reintroduce it.
 *
 * Lowercasing happens here too. Addresses are stored lowercased, so a lookup with
 * `Sam@Example.com` would otherwise miss the account and — on the Google callback —
 * create a duplicate member with no subscription attached.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')

/** Optional variant, for update endpoints where the field may be absent. */
export const optionalEmailSchema = emailSchema.optional()
