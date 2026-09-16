'use client'

import * as React from 'react'
import { upload } from '@vercel/blob/client'
import { ImageUp, X } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import {
  MAX_PHOTO_BYTES,
  SECTION_BLOB_PREFIX,
  describeBytes,
  photoRejectionReason,
} from '@/lib/author-photo'

/**
 * Choose a title image for a section, or paste a URL.
 *
 * The same shape as the author photograph field, and for the same reasons — the file goes
 * browser → Vercel Blob directly, because a serverless function refuses a body over
 * ~4.5 MB before any handler runs, and the URL box stays so that a deployment without Blob
 * configured can still set a picture.
 *
 * What differs is the preview. A section image is a wide banner rather than a portrait, so
 * it is shown in the 16:9 frame the cards and the section heading actually use: a picture
 * whose subject sits in the corner should look wrong here, not after publishing.
 */
export function SectionImageField({
  id,
  value,
  onChange,
}: {
  /** Unique per form instance — several of these render on the sections screen at once. */
  id: string
  value: string
  onChange: (url: string) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  async function choose(file: File) {
    // Checked before the upload starts, so somebody who picked a 40 MB TIFF is told now
    // rather than after waiting for it to transfer and fail.
    const reason = photoRejectionReason(file, 'Title images')
    if (reason) {
      toast(reason, 'error')
      return
    }

    setBusy(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-60)
      const blob = await upload(`${SECTION_BLOB_PREFIX}${Date.now()}-${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/sections/image',
      })
      onChange(blob.url)
      toast(`Title image uploaded (${describeBytes(file.size)}).`)
    } catch (error) {
      /*
       * The SDK swallows our route's own reply: with no BLOB_READ_WRITE_TOKEN the route
       * answers 503 explaining what to do, and @vercel/blob discards it and throws
       * "Failed to retrieve the client token". Matching the vendor string is not elegant,
       * but the alternative is a dead end where the fix is one environment variable or the
       * field immediately below the button.
       */
      const raw = error instanceof Error ? error.message : ''
      toast(
        /client token/i.test(raw)
          ? 'File storage is not set up for this deployment, so the image was not saved. ' +
              'Paste an image URL below instead, or add BLOB_READ_WRITE_TOKEN in Vercel.'
          : raw || 'The title image could not be uploaded.',
        'error',
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <Label htmlFor={`${id}-imageUrl`}>Title image</Label>

      {/* The 16:9 frame the cards use. A picture whose subject sits in a corner should
          look wrong here rather than after it is published. */}
      <div className="mb-2 aspect-[16/9] w-full max-w-[260px] overflow-hidden rounded-lg border border-line bg-panel-2">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary external
          // host, which next/image would need configuring for one URL at a time.
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-ink-dim">
            No image yet
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner /> : <ImageUp className="h-3.5 w-3.5" aria-hidden />}
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload an image'}
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
        id={`${id}-imageUrl`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="…or paste an image URL"
        maxLength={300}
        className="mt-2"
      />
      <Hint>
        Landscape, JPEG, PNG or WebP, up to {describeBytes(MAX_PHOTO_BYTES)}. Shown across the
        top of the subject&rsquo;s card and page, so upload the widest version you have. A
        section with no image falls back to its name on a plain panel — nothing breaks.
      </Hint>
    </div>
  )
}
