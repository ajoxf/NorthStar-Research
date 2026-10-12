import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { getCurrentMember } from '@/lib/auth'
import { MissingConfigError, requireEnv } from '@/lib/env'
import { authorForMember } from '@/lib/expert-account'
import { EXPERT_REPORT_PREFIX, MAX_PDF_BYTES } from '@/lib/report-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A short-lived token for an expert to upload a report PDF straight to Blob — the same
 * reasoning as /api/admin/reports/upload, with a narrower token: only for a signed-in
 * expert, only under `expert-reports/`, only PDF, only up to the same size cap.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 403 })
  if (!(await authorForMember(member.id))) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  let token: string
  try {
    token = requireEnv('BLOB_READ_WRITE_TOKEN', 'Report file storage (Vercel Blob)')
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return NextResponse.json({ error: 'File storage is not configured, so the PDF was not saved. Tell the team.' }, { status: 503 })
    }
    throw error
  }

  try {
    const result = await handleUpload({
      token,
      request,
      body: (await request.json()) as HandleUploadBody,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(EXPERT_REPORT_PREFIX)) throw new Error('Report uploads must be stored under the expert reports prefix.')
        return { allowedContentTypes: ['application/pdf'], maximumSizeInBytes: MAX_PDF_BYTES, addRandomSuffix: true }
      },
      onUploadCompleted: async () => {
        // Nothing: the report row is created by the form's own request once this finishes.
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[expert:reports] upload token failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The upload could not be authorised.' }, { status: 400 })
  }
}
