'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type CregisFieldState = {
  /** Whether a value exists, and where it came from. Never the value itself. */
  source: 'console' | 'environment' | 'unset'
  /** Safe to show: a length, or the value when it is not a credential. */
  detail: string | null
  updatedAt: string | null
  updatedByEmail: string | null
}

export type CregisFormState = {
  projectId: CregisFieldState
  apiKey: CregisFieldState
  baseUrl: CregisFieldState
  callbackIps: CregisFieldState & { value: string }
}

/**
 * Edit the Cregis credentials without a redeploy.
 *
 * Secrets are write-only here. A saved value is never sent back to the browser — the
 * fields show where the value came from and when it changed, not what it is. So there is
 * no screen in this product on which a live credential can be read, which keeps
 * shoulder-surfing, screen sharing and screenshots out of the threat model even though
 * the value is now editable.
 *
 * The exception is the IP allowlist, which is not a secret and is round-tripped so it can
 * be edited rather than retyped.
 *
 * Blank means "leave as it is". Clearing a field is a separate, explicit action, because
 * an empty text box is far too easy to submit by accident when it would wipe the
 * credential that takes payments.
 */
export function CregisForm({ state }: { state: CregisFormState }) {
  const router = useRouter()
  const toast = useToast()

  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [projectId, setProjectId] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [baseUrl, setBaseUrl] = React.useState('')
  const [callbackIps, setCallbackIps] = React.useState(state.callbackIps.value)

  async function save(payload: Record<string, string>, successMessage: string) {
    setError(null)
    setPending(true)
    try {
      const response = await fetch('/api/admin/payments/cregis', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const message = data?.error ?? `Could not save (HTTP ${response.status}).`
        setError(message)
        toast(message, 'error')
        return
      }

      toast(successMessage, 'success')
      setProjectId('')
      setApiKey('')
      setBaseUrl('')
      router.refresh()
    } catch {
      setError('Could not save. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Only non-empty fields are sent, so an untouched box never overwrites a live value.
    const payload: Record<string, string> = {}
    if (projectId.trim()) payload.projectId = projectId.trim()
    if (apiKey.trim()) payload.apiKey = apiKey.trim()
    if (baseUrl.trim()) payload.baseUrl = baseUrl.trim()
    if (callbackIps !== state.callbackIps.value) payload.callbackIps = callbackIps

    if (Object.keys(payload).length === 0) {
      setError('Nothing to save — fill in a field first.')
      return
    }

    await save(payload, 'Cregis settings updated')
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-panel p-5" noValidate>
      <div className="mb-5">
        <Label htmlFor="cregis-projectId">Project ID</Label>
        <Input
          id="cregis-projectId"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder={placeholderFor(state.projectId, 'Leave blank to keep the current value')}
          inputMode="numeric"
          autoComplete="off"
        />
        <SourceLine field={state.projectId} />
      </div>

      <div className="mb-5">
        <Label htmlFor="cregis-apiKey">API key</Label>
        <Input
          id="cregis-apiKey"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={placeholderFor(state.apiKey, 'Leave blank to keep the current value')}
          autoComplete="off"
        />
        <SourceLine field={state.apiKey} />
      </div>

      <div className="mb-5">
        <Label htmlFor="cregis-baseUrl">API base URL</Label>
        <Input
          id="cregis-baseUrl"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder={placeholderFor(state.baseUrl, 'https://…')}
          autoComplete="off"
        />
        <SourceLine field={state.baseUrl} />
      </div>

      <div className="mb-5">
        <Label htmlFor="cregis-callbackIps">Callback IP allowlist</Label>
        <Textarea
          id="cregis-callbackIps"
          rows={3}
          value={callbackIps}
          onChange={(event) => setCallbackIps(event.target.value)}
          placeholder="Optional. One address per line, or comma separated."
          className="font-mono text-[13px]"
        />
        <Hint>
          Optional and off by default. When set, only these addresses may deliver a payment
          callback. Leave it empty unless Cregis have given you fixed addresses — they have
          historically called from a rotating pool, and an incomplete list here would reject
          real payments. The signature check protects the callback either way.
        </Hint>
      </div>

      <FieldError>{error}</FieldError>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                'Clear the values stored here and fall back to the environment variables in Vercel?\n\n' +
                  'If Vercel has no Cregis credentials set, crypto checkout will stop working.',
              )
            ) {
              return
            }
            void save(
              { projectId: '', apiKey: '', baseUrl: '' },
              'Cleared — the environment variables are in use again',
            )
          }}
          className="text-[13px] text-ink-dim underline underline-offset-4 transition-colors hover:text-ink"
        >
          Clear and use Vercel again
        </button>
      </div>
    </form>
  )
}

function placeholderFor(field: CregisFieldState, fallback: string): string {
  return field.source === 'unset' ? 'Not set' : fallback
}

function SourceLine({ field }: { field: CregisFieldState }) {
  if (field.source === 'unset') {
    return <Hint>Not set anywhere. Crypto checkout will refuse to run.</Hint>
  }

  if (field.source === 'environment') {
    return (
      <Hint>
        Currently from Vercel{field.detail ? ` · ${field.detail}` : ''}. Saving here overrides it.
      </Hint>
    )
  }

  return (
    <Hint>
      Set here{field.detail ? ` · ${field.detail}` : ''}
      {field.updatedAt ? ` · changed ${field.updatedAt}` : ''}
      {field.updatedByEmail ? ` by ${field.updatedByEmail}` : ''}. Overrides Vercel.
    </Hint>
  )
}
