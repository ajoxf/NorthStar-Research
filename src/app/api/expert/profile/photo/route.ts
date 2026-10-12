import { getCurrentMember } from '@/lib/auth'
import { EXPERT_PHOTO_PREFIX } from '@/lib/author-photo'
import { authorForMember } from '@/lib/expert-account'
import { imageUploadToken } from '@/lib/image-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Issues a short-lived token for an expert to upload a photograph of themselves.
 *
 * Only into `expert-photos/`, which nothing public reads until an admin approves the
 * profile change it belongs to — the same three inert image types and size cap as the
 * admin uploads. See lib/image-upload.
 */
export async function POST(request: Request) {
  return imageUploadToken(request, EXPERT_PHOTO_PREFIX, 'Expert photographs', async () => {
    const member = await getCurrentMember()
    if (!member) return 'You must be signed in.'
    return (await authorForMember(member.id)) ? null : 'This account is not an expert.'
  })
}
