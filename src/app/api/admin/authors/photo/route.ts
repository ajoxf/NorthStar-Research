import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { MissingConfigError, requireEnv } from '@/lib/env'
import { ALLOWED_PHOTO_TYPES, AUTHOR_BLOB_PREFIX, MAX_PHOTO_BYTES } from '@/lib/author-photo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Issues a short-lived token so the browser can upload an author photograph straight to
 * Vercel Blob, without the file passing through this function.
 *
 * The same shape as the report upload route, for the same reason: a serverless function
 * refuses a request body over ~4.5 MB before the handler runs, so a high-resolution
 * portrait would be rejected at the edge with a response this app never sees. Only the
 * token request comes here — a few hundred bytes — and the file goes browser → Blob.
 *
 * The token is deliberately narrow: minted only for an admin, only for an `authors/`
 * path, only for the three inert image types, and only up to MAX_PHOTO_BYTES. A leaked
 * token cannot be turned into general-purpose file hosting on the account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  let token: string
  try {
    token = requireEnv('BLOB_READ_WRITE_TOKEN', 'Author photographs (Vercel Blob)')
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return NextResponse.json(
        {
          error:
            'File storage is not configured for this deployment, so the photograph was not ' +
            'saved. You can paste an image URL instead.',
        },
        { status: 503 },
      )
    }
    throw error
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // The admin check above already ran; this second guard is about the *path*, so a
        // token can never be minted for anything outside the author area.
        if (!pathname.startsWith(AUTHOR_BLOB_PREFIX)) {
          throw new Error('Author photographs must be stored under the authors prefix.')
        }

        return {
          allowedContentTypes: [...ALLOWED_PHOTO_TYPES],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // Nothing to do. The author row is saved by the form's own request once the
        // upload finishes, which is the only point the rest of the profile is known.
        // Vercel cannot reach localhost, so this never fires in development either.
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[admin:authors] photo upload token failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The upload could not be authorised.' },
      { status: 400 },
    )
  }
}
