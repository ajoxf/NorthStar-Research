'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { PhotoField } from '@/app/admin/sections/photo-field'
import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { EXPERT_PHOTO_PREFIX } from '@/lib/author-photo'
import { parseCredentials } from '@/lib/section-shape'

type Fields = {
  headline: string | null
  bio: string | null
  photoUrl: string | null
  credentials: string[]
  websiteUrl: string | null
  linkedinUrl: string | null
  xUrl: string | null
}

/**
 * An expert's own edit of their public profile. Sending it changes nothing public: it goes
 * to the desk, and the live profile keeps its current text until an admin approves.
 */
export function ProfileForm({ name, initial }: { name: string; initial: Fields }) {
  const router = useRouter()
  const toast = useToast()
  const [photoUrl, setPhotoUrl] = React.useState(initial.photoUrl ?? '')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  return (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const text = (key: string) => String(data.get(key) ?? '').trim()
        setError(null)
        setPending(true)
        try {
          const response = await fetch('/api/expert/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              headline: text('headline'),
              bio: text('bio'),
              photoUrl: photoUrl.trim(),
              credentials: parseCredentials(text('credentials')),
              websiteUrl: text('websiteUrl'),
              linkedinUrl: text('linkedinUrl'),
              xUrl: text('xUrl'),
            }),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) {
            setError(body.error ?? 'Your changes could not be sent.')
            return
          }
          toast('Sent for review — your profile changes once it is approved', 'success')
          router.refresh()
        } catch {
          setError('Your changes could not be sent.')
        } finally {
          setPending(false)
        }
      }}
    >
      <div className="space-y-5">
        <PhotoField
          name={name}
          value={photoUrl}
          onChange={setPhotoUrl}
          uploadUrl="/api/expert/profile/photo"
          prefix={EXPERT_PHOTO_PREFIX}
          allowUrl={false}
        />
        <div>
          <Label htmlFor="p-headline">Headline</Label>
          <Input id="p-headline" name="headline" maxLength={140} defaultValue={initial.headline ?? ''} placeholder="Twenty years on the LME floor" />
          <Hint>One line under your name.</Hint>
        </div>
        <div>
          <Label htmlFor="p-bio">Biography</Label>
          <Textarea id="p-bio" name="bio" rows={7} maxLength={4000} defaultValue={initial.bio ?? ''} />
        </div>
        <div>
          <Label htmlFor="p-credentials">Credentials</Label>
          <Textarea id="p-credentials" name="credentials" rows={4} defaultValue={initial.credentials.join('\n')} />
          <Hint>One per line: qualifications, past desks, publications. Up to twelve.</Hint>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="p-web">Website</Label>
            <Input id="p-web" name="websiteUrl" type="url" defaultValue={initial.websiteUrl ?? ''} placeholder="https://" />
          </div>
          <div>
            <Label htmlFor="p-li">LinkedIn</Label>
            <Input id="p-li" name="linkedinUrl" type="url" defaultValue={initial.linkedinUrl ?? ''} placeholder="https://linkedin.com/in/…" />
          </div>
          <div>
            <Label htmlFor="p-x">X</Label>
            <Input id="p-x" name="xUrl" type="url" defaultValue={initial.xUrl ?? ''} placeholder="https://x.com/…" />
          </div>
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            'Send for review'
          )}
        </Button>
        <span className="text-[14px] text-ink-dim">
          No figures about returns or performance — the desk will send those back. Your name and section titles are changed by
          the team.
        </span>
      </div>
    </form>
  )
}
