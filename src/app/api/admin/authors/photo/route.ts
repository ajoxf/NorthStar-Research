import { AUTHOR_BLOB_PREFIX } from '@/lib/author-photo'
import { imageUploadToken } from '@/lib/image-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Issues a short-lived token for an author photograph.
 *
 * The token is scoped to the `authors/` prefix, which is the whole point of having a route
 * per area rather than one that takes the destination as input — see lib/image-upload.
 */
export async function POST(request: Request) {
  return imageUploadToken(request, AUTHOR_BLOB_PREFIX, 'Author photographs')
}
