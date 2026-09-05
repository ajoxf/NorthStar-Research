'use client'

import * as React from 'react'
import { upload } from '@vercel/blob/client'
import { ImageUp, X } from 'lucide-react'

import { AuthorAvatar } from '@/components/author-avatar'
import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import {
  AUTHOR_BLOB_PREFIX,
  MAX_PHOTO_BYTES,
  describeBytes,
  photoRejectionReason,
} from '@/lib/author-photo'

/**
 * Choose a photograph, or paste a URL.
 *
 * The file goes browser → Vercel Blob directly, using a token this app mints. That is not
 * an optimisation: a serverless function refuses a body over ~4.5 MB before any handler
 * runs, so uploading through a route would reject exactly the high-resolution portraits
 * this field exists to accept, with an error the app never gets to explain.
 *
 * The URL field stays, for two reasons. A deployment without Blob configured can still
 * set a photograph, and an operator who already hosts their headshots somewhere should
 * not have to re-upload them here. Uploading simply fills the same field in.
 */
export function PhotoField({
  name,
  value,
  onChange,
}: {
  /** The author's name — used for the initials fallback in the preview. */
  name: string
  value: string
  onChange: (url: string) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  async function choose(file: File) {
    // Checked before the upload starts, so somebody who picked a 40 MB TIFF is told now
    // rather than after waiting for it to transfer and fail.
    const reason = photoRejectionReason(file)
    if (reason) {
      toast(reason, 'error')
      return
    }

    setBusy(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-60)
      const blob = await upload(`${AUTHOR_BLOB_PREFIX}${Date.now()}-${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/authors/photo',
      })
      onChange(blob.url)
      toast(`Photograph uploaded (${describeBytes(file.size)}).`)
    } catch (error) {
      /*
       * The SDK swallows our route's own reply.
       *
       * When BLOB_READ_WRITE_TOKEN is unset the route answers 503 with "storage is not
       * configured, paste a URL instead" — and @vercel/blob discards that and throws
       * "Failed to retrieve the client token", which tells an operator nothing they can
       * act on. Matching the vendor string is not elegant, but the alternative is showing
       * somebody a dead end when the fix is one environment variable or the field
       * immediately below the button.
       */
      const raw = error instanceof Error ? error.message : ''
      toast(
        /client token/i.test(raw)
          ? 'File storage is not set up for this deployment, so the photograph was not saved. ' +
              'Paste an image URL below instead, or add BLOB_READ_WRITE_TOKEN in Vercel.'
          : raw || 'The photograph could not be uploaded.',
        'error',
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <Label htmlFor="a-photoUrl">Photograph</Label>

      <div className="flex items-start gap-4">
        {/* Shown at the size it appears on a profile page, so a badly cropped headshot is
            obvious here rather than after publishing. */}
        <AuthorAvatar name={name || '?'} photoUrl={value || null} size={64} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? <Spinner /> : <ImageUp className="h-3.5 w-3.5" aria-hidden />}
              {busy ? 'Uploading…' : value ? 'Replace' : 'Upload a photograph'}
            </Button>

            {value && (
              <Button type="button" size="sm" variant="secondary" onClick={() => onChange('')}>
                <X className="h-3.5 w-3.5" aria-hidden />
                Remove
              </Button>
            )}
          </div>

          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void choose(file)
            }}
          />

          <Input
            id="a-photoUrl"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="…or paste an image URL"
            maxLength={300}
            className="mt-2"
          />
          <Hint>
            JPEG, PNG or WebP, up to {describeBytes(MAX_PHOTO_BYTES)}. Upload the largest you
            have — it is shown small on cards and large on the profile page, so a high-resolution
            original stays sharp on both.
          </Hint>
        </div>
      </div>
    </div>
  )
}
