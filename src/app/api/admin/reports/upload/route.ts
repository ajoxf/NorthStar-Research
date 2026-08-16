import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { MissingConfigError, requireEnv } from '@/lib/env'
import { MAX_PDF_BYTES, REPORT_BLOB_PREFIX } from '@/lib/report-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Issues a short-lived token so the browser can upload a report PDF straight to Vercel
 * Blob, without the file passing through this function.
 *
 * **This is what makes a real report uploadable at all.** A Vercel serverless function
 * has a hard ~4.5 MB request body limit, enforced by the platform *before* the handler
 * runs. The upload route used to receive the file itself, so a 15 MB research PDF — an
 * ordinary size for a document full of charts — was rejected at the edge with a response
 * the app never got to see, and the admin was told only "The report could not be saved."
 * No amount of checking inside the handler could catch it, because the handler was never
 * reached.
 *
 * Only the *token request* comes here now. It is a few hundred bytes, and the file goes
 * browser → Blob directly, which has no such ceiling.
 *
 * The token is deliberately narrow. It is minted only for an admin, only for a
 * `reports/` path, only for `application/pdf`, and only up to `MAX_PDF_BYTES` — so a
 * leaked token cannot be turned into general-purpose file hosting on the account.
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
    token = requireEnv('BLOB_READ_WRITE_TOKEN', 'Report file storage (Vercel Blob)')
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return NextResponse.json(
        { error: 'File storage is not configured for this deployment, so the PDF was not saved.' },
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
        // The admin check above already ran for this request; this second guard is about
        // the *path*, so a token can never be minted for anything outside the report area.
        if (!pathname.startsWith(REPORT_BLOB_PREFIX)) {
          throw new Error('Report uploads must be stored under the reports prefix.')
        }

        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_PDF_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // Nothing to do. The report row is created by the form's own POST once the upload
        // finishes, which is also the only point the title and publish date are known.
        // Vercel cannot reach localhost, so this never fires in development — another
        // reason not to put anything load-bearing in it.
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[admin:reports] upload token failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The upload could not be authorised.' },
      { status: 400 },
    )
  }
}
