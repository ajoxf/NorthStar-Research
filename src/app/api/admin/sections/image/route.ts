import { SECTION_BLOB_PREFIX } from '@/lib/author-photo'
import { imageUploadToken } from '@/lib/image-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Issues a short-lived token for a section's title image.
 *
 * Scoped to the `sections/` prefix. A token from here cannot write into the author area,
 * and one from the author route cannot write here.
 */
export async function POST(request: Request) {
  return imageUploadToken(request, SECTION_BLOB_PREFIX, 'Section title images')
}
