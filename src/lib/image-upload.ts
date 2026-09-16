import 'server-only'

import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { MissingConfigError, requireEnv } from '@/lib/env'
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, type ImageBlobPrefix } from '@/lib/author-photo'

/**
 * Mint a short-lived token so the browser can upload an image straight to Vercel Blob,
 * without the file passing through this function.
 *
 * Shared by the author photograph and section title image routes, because the reasoning is
 * identical: a serverless function refuses a request body over ~4.5 MB before the handler
 * runs, so a high-resolution picture sent through a route would be rejected at the edge
 * with a response this app never sees. Only the token request comes here — a few hundred
 * bytes — and the file goes browser → Blob.
 *
 * **The prefix is the security boundary**, which is why each caller passes its own and the
 * token is refused for anything outside it. A token minted for a section picture cannot be
 * turned into one that overwrites an author's portrait, and neither can be turned into
 * general-purpose file hosting on the account: admin only, one prefix, three inert image
 * types, capped size.
 */
export async function imageUploadToken(
  request: Request,
  prefix: ImageBlobPrefix,
  /** What these files are, for the error an operator reads. */
  label: string,
): Promise<NextResponse> {
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
    token = requireEnv('BLOB_READ_WRITE_TOKEN', `${label} (Vercel Blob)`)
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return NextResponse.json(
        {
          error:
            'File storage is not configured for this deployment, so the image was not ' +
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
        // token can never be minted for anything outside this one area.
        if (!pathname.startsWith(prefix)) {
          throw new Error(`${label} must be stored under the ${prefix} prefix.`)
        }

        return {
          allowedContentTypes: [...ALLOWED_PHOTO_TYPES],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // Nothing to do. The row is saved by the form's own request once the upload
        // finishes, which is the only point the rest of the record is known. Vercel
        // cannot reach localhost, so this never fires in development either.
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error(`[admin:upload] ${prefix} upload token failed`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The upload could not be authorised.' },
      { status: 400 },
    )
  }
}
