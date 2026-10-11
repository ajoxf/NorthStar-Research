'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

type FieldView = {
  key: string
  label: string
  secret: boolean
  required: boolean
  options: string[] | null
  placeholder: string | null
  help: string | null
  env: string | null
  state: { source: 'saved' | 'env' | null; shown: string | null; unreadable: boolean }
}

type CustomView = { name: string; label: string; payUrl: string; instructions: string; currencies: string }

export type ProviderView = {
  id: string
  name: string
  label: string
  regions: string
  keysHelp: string
  webhookUrl: string | null
  webhookEvents: string[]
  webhookNote: string | null
  hasTest: boolean
  status: 'ready' | 'paused' | 'missing'
  unreadable: boolean
  hasSaved: boolean
  canPause: boolean
  fields: FieldView[]
  custom: CustomView | null
}

export type RuleView = {
  id: string
  country: string | null
  currency: string | null
  gateway: string
  gatewayName: string
  priority: number
  isActive: boolean
}

const STATUS: Record<ProviderView['status'], { label: string; tone: 'up' | 'muted' | 'accent' }> = {
  ready: { label: 'Ready', tone: 'up' },
  paused: { label: 'Paused', tone: 'muted' },
  missing: { label: 'Keys missing', tone: 'accent' },
}

/** A JSON request with the error the server gave, or a generic one. */
async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: response.ok, data }
  } catch {
    return { ok: false, data: { error: 'Could not reach the server.' } }
  }
}

function errorOf(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === 'string' ? data.error : fallback
}

/* ---------------------------------------------------------------------------------- */

export function ProviderCard({ provider, placeholders }: { provider: ProviderView; placeholders: string[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState<'keys' | 'details' | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)
  const status = STATUS[provider.status]
  const isCustom = provider.custom !== null

  async function test() {
    setBusy('test')
    setResult(null)
    const { ok, data } = await send(`/api/admin/payment-providers/${provider.id}/test`, 'POST')
    setBusy(null)
    setResult(ok ? (data as { ok: boolean; message: string }) : { ok: false, message: errorOf(data, 'The test could not run.') })
  }

  async function pause(paused: boolean) {
    setBusy('pause')
    const { ok, data } = await send(`/api/admin/payment-providers/${provider.id}/pause`, 'POST', { paused })
    setBusy(null)
    if (!ok) return toast(errorOf(data, 'That could not be changed.'), 'error')
    toast(paused ? `${provider.name} paused — buyers no longer see it` : `${provider.name} resumed`, 'success')
    router.refresh()
  }

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-line bg-panel p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[19px] text-ink">{provider.name}</h3>
          <p className="mt-0.5 text-[15px] leading-snug text-ink-dim">{provider.regions}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      {provider.unreadable && (
        <p className="mt-3 rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-[15px] text-down">
          Saved keys can&rsquo;t be read any more — the site&rsquo;s secret changed since they were saved. Enter them again.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={open === 'keys' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'keys' ? null : 'keys')}>
          {provider.fields.length === 0 ? 'Setup' : provider.hasSaved || provider.status === 'ready' ? 'Edit keys' : 'Add API keys'}
        </Button>
        {isCustom && (
          <Button size="sm" variant={open === 'details' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'details' ? null : 'details')}>
            Edit
          </Button>
        )}
        {provider.hasTest && (
          <Button size="sm" variant="secondary" onClick={test} disabled={busy !== null}>
            {busy === 'test' && <Spinner />}
            Test connection
          </Button>
        )}
        {provider.canPause && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => pause(provider.status !== 'paused')}
            disabled={busy !== null}
          >
            {busy === 'pause' && <Spinner />}
            {provider.status === 'paused' ? 'Resume' : 'Pause'}
          </Button>
        )}
      </div>

      {result && <TestMessage result={result} />}

      {open === 'keys' && <KeysForm provider={provider} onResult={setResult} />}
      {open === 'details' && provider.custom && (
        <CustomForm id={provider.id} initial={provider.custom} placeholders={placeholders} onDone={() => setOpen(null)} />
      )}
    </article>
  )
}

function TestMessage({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <p
      role="status"
      className={`mt-3 rounded-lg border px-3 py-2 text-[15px] leading-relaxed ${
        result.ok ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'
      }`}
    >
      {result.message}
    </p>
  )
}

function KeysForm({ provider, onResult }: { provider: ProviderView; onResult: (result: { ok: boolean; message: string }) => void }) {
  const router = useRouter()
  const toast = useToast()
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((field) => [field.key, field.secret ? '' : (field.state.source === 'saved' ? (field.state.shown ?? '') : '')])),
  )
  const [busy, setBusy] = React.useState<'save' | 'remove' | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy('save')
    setError(null)
    const { ok, data } = await send(`/api/admin/payment-providers/${provider.id}/keys`, 'POST', { values })
    setBusy(null)
    if (!ok) return setError(errorOf(data, 'The keys could not be saved.'))
    const test = data.test as { ok: boolean; message: string }
    onResult(test)
    toast(test.ok ? 'Saved and connected' : 'Saved — but the test failed', test.ok ? 'success' : 'error')
    setValues((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, provider.fields.find((f) => f.key === key)?.secret ? '' : value])))
    router.refresh()
  }

  async function remove() {
    setBusy('remove')
    const { ok, data } = await send(`/api/admin/payment-providers/${provider.id}/keys`, 'DELETE')
    setBusy(null)
    setConfirmRemove(false)
    if (!ok) return setError(errorOf(data, 'The keys could not be removed.'))
    toast('Saved keys removed', 'success')
    router.refresh()
  }

  return (
    <form onSubmit={save} className="mt-4 border-t border-line pt-4" noValidate>
      <p className="text-[15px] leading-relaxed text-ink-dim">{provider.keysHelp}</p>

      {provider.fields.map((field) => (
        <div key={field.key} className="mt-4">
          <Label htmlFor={`${provider.id}-${field.key}`}>{field.label}</Label>
          {field.options ? (
            <select
              id={`${provider.id}-${field.key}`}
              value={values[field.key] ?? ''}
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              className="h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-[16px] text-ink"
            >
              <option value="">{field.state.source === 'env' ? 'Use the environment variable' : 'Choose…'}</option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={`${provider.id}-${field.key}`}
              type={field.secret ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              value={values[field.key] ?? ''}
              placeholder={field.secret && field.state.shown ? field.state.shown : (field.placeholder ?? undefined)}
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              maxLength={4000}
            />
          )}
          <Hint>{fieldNote(field)}</Hint>
        </div>
      ))}

      {(provider.webhookUrl || provider.webhookNote) && (
        <div className="mt-5 rounded-lg border border-line bg-panel-2 px-4 py-3">
          {provider.webhookUrl && <CopyLine label="Webhook URL" value={provider.webhookUrl} />}
          {provider.webhookNote ? (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">{provider.webhookNote}</p>
          ) : provider.custom ? (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">
              To confirm payments automatically, POST JSON{' '}
              <code className="font-mono text-[13px] text-ink">{'{"order_number": 1042, "status": "paid", "reference": "…"}'}</code>{' '}
              with header <code className="font-mono text-[13px] text-ink">X-Signature</code> = hex HMAC-SHA256 of the body
              using the webhook secret. Without a secret, use &ldquo;Mark as paid&rdquo; on Payments.
            </p>
          ) : provider.webhookEvents.length > 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">
              Send these events: <span className="font-mono text-[13px] text-ink">{provider.webhookEvents.join(', ')}</span>
            </p>
          ) : null}
        </div>
      )}

      {error && <p className="mt-3 text-[15px] text-down">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {provider.fields.length > 0 && (
          <Button type="submit" disabled={busy !== null}>
            {busy === 'save' && <Spinner />}
            {provider.hasTest ? 'Save & test' : 'Save'}
          </Button>
        )}
        {provider.hasSaved &&
          (confirmRemove ? (
            <>
              <Button type="button" variant="danger" onClick={remove} disabled={busy !== null}>
                {busy === 'remove' && <Spinner />}
                Yes, remove saved keys
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setConfirmRemove(true)}>
              Remove saved keys
            </Button>
          ))}
      </div>
    </form>
  )
}

function fieldNote(field: FieldView): string {
  const extra = field.help ? ` ${field.help}` : ''
  if (field.state.unreadable) return `Saved, but can no longer be read — enter it again.${extra}`
  if (field.state.source === 'saved') {
    return field.secret ? `Saved ${field.state.shown} · leave blank to keep.${extra}` : `Saved.${extra}`
  }
  if (field.state.source === 'env') {
    return `Currently from an environment variable${field.env ? ` (${field.env})` : ''} · enter a value here to override.${extra}`
  }
  return `${field.required ? 'Required.' : 'Optional.'}${extra}`
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div>
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-dim">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[14px] text-ink">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            } catch {
              // Clipboard refused; the URL is on screen to select.
            }
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[13px] text-ink-dim hover:text-ink"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------------- */

function CustomForm({
  id,
  initial,
  placeholders,
  onDone,
}: {
  id: string | null
  initial: CustomView
  placeholders: string[]
  onDone: (result?: { id: string; name: string }) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = React.useState(initial)
  const [busy, setBusy] = React.useState<'save' | 'delete' | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const prefix = id ?? 'new-provider'

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy('save')
    setError(null)
    const { ok, data } = await send(id ? `/api/admin/payment-providers/custom/${id}` : '/api/admin/payment-providers/custom', id ? 'PATCH' : 'POST', form)
    setBusy(null)
    if (!ok) return setError(errorOf(data, 'That could not be saved.'))
    if (!id) {
      toast(`${form.name} added`, 'success')
      onDone({ id: String(data.id), name: String(data.name) })
    } else {
      toast('Details saved', 'success')
      onDone()
    }
    router.refresh()
  }

  async function remove() {
    if (!id) return
    setBusy('delete')
    const { ok, data } = await send(`/api/admin/payment-providers/custom/${id}`, 'DELETE')
    setBusy(null)
    if (!ok) return setError(errorOf(data, 'That could not be deleted.'))
    toast(`${initial.name} deleted, with its rules and keys`, 'success')
    router.refresh()
  }

  return (
    <form onSubmit={save} className="mt-4 border-t border-line pt-4" noValidate>
      <div className="grid gap-4">
        <div>
          <Label htmlFor={`${prefix}-name`}>Name</Label>
          <Input id={`${prefix}-name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ziina" maxLength={60} />
        </div>
        <div>
          <Label htmlFor={`${prefix}-label`}>Button text buyers see</Label>
          <Input
            id={`${prefix}-label`}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={form.name ? `Pay with ${form.name}` : 'Pay with …'}
            maxLength={60}
          />
        </div>
        <div>
          <Label htmlFor={`${prefix}-url`}>Payment link</Label>
          <Input
            id={`${prefix}-url`}
            value={form.payUrl}
            onChange={(e) => setForm({ ...form, payUrl: e.target.value })}
            placeholder="https://pay.example.com/your-page?amount={amount}&ref={order_number}"
            spellCheck={false}
          />
          <Hint>
            Optional, https only. Filled in for each order: <span className="font-mono">{placeholders.join(' ')}</span>
          </Hint>
        </div>
        <div>
          <Label htmlFor={`${prefix}-instructions`}>Instructions</Label>
          <Textarea
            id={`${prefix}-instructions`}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            rows={4}
            placeholder="Bank: … · IBAN: … · Quote your payment reference."
          />
          <Hint>Shown to the buyer on the payment page. A payment link, instructions, or both.</Hint>
        </div>
        <div>
          <Label htmlFor={`${prefix}-currencies`}>Currencies</Label>
          <Input
            id={`${prefix}-currencies`}
            value={form.currencies}
            onChange={(e) => setForm({ ...form, currencies: e.target.value })}
            placeholder="AED, USD — blank for any"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-[15px] text-down">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy !== null}>
          {busy === 'save' && <Spinner />}
          {id ? 'Save details' : 'Add provider'}
        </Button>
        {!id && (
          <Button type="button" variant="secondary" onClick={() => onDone()}>
            Cancel
          </Button>
        )}
        {id &&
          (confirmDelete ? (
            <>
              <Button type="button" variant="danger" onClick={remove} disabled={busy !== null}>
                {busy === 'delete' && <Spinner />}
                Yes, delete {initial.name}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete provider
            </Button>
          ))}
      </div>
      {id && confirmDelete && (
        <p className="mt-2 text-[14px] text-ink-dim">Its rules and saved keys go too. Past orders keep their history.</p>
      )}
    </form>
  )
}

export function AddProvider({ placeholders }: { placeholders: string[] }) {
  const [open, setOpen] = React.useState(false)
  const [added, setAdded] = React.useState<string | null>(null)
  return (
    <div className="rounded-xl border border-dashed border-line p-5">
      <h3 className="text-[19px] text-ink">Add any other payment provider</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-dim">
        A payment link, bank transfer, or a crypto link — no code. Buyers see your instructions and the link; you confirm
        each payment, or let the provider confirm it by webhook.
      </p>
      {added && (
        <p role="status" className="mt-3 rounded-lg border border-up/40 bg-up/10 px-3 py-2 text-[15px] text-up">
          {added} added. Now add a rule for it under &ldquo;Which provider each buyer sees&rdquo;.
        </p>
      )}
      {open ? (
        <CustomForm
          id={null}
          initial={{ name: '', label: '', payUrl: '', instructions: '', currencies: '' }}
          placeholders={placeholders}
          onDone={(result) => {
            setOpen(false)
            if (result) setAdded(result.name)
          }}
        />
      ) : (
        <Button className="mt-4" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add provider
        </Button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------- */

export function RulesTable({
  rules,
  isDefault,
  options,
}: {
  rules: RuleView[]
  isDefault: boolean
  options: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = React.useState({ country: '', currency: '', gateway: options[0]?.id ?? '', priority: '100' })
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy('add')
    setError(null)
    const { ok, data } = await send('/api/admin/payment-rules', 'POST', {
      country: form.country.trim() || undefined,
      currency: form.currency.trim() || undefined,
      gateway: form.gateway,
      priority: Number(form.priority) || 100,
    })
    setBusy(null)
    if (!ok) return setError(errorOf(data, 'The rule could not be added.'))
    toast('Rule added', 'success')
    setForm({ ...form, country: '', currency: '' })
    router.refresh()
  }

  async function toggle(rule: RuleView) {
    setBusy(rule.id)
    const { ok, data } = await send(`/api/admin/payment-rules/${rule.id}`, 'PATCH', { isActive: !rule.isActive })
    setBusy(null)
    if (!ok) return toast(errorOf(data, 'That could not be changed.'), 'error')
    toast(rule.isActive ? 'Rule paused' : 'Rule resumed', 'success')
    router.refresh()
  }

  async function remove(rule: RuleView) {
    setBusy(rule.id)
    const { ok, data } = await send(`/api/admin/payment-rules/${rule.id}`, 'DELETE')
    setBusy(null)
    setConfirm(null)
    if (!ok) return toast(errorOf(data, 'That could not be deleted.'), 'error')
    toast('Rule deleted', 'success')
    router.refresh()
  }

  return (
    <div className="mt-4">
      {isDefault ? (
        <p className="rounded-lg border border-line bg-panel px-4 py-3 text-[16px] leading-relaxed text-ink-dim">
          No rules yet, so every buyer is offered Stripe (card), then Cregis (crypto) — whichever are ready. Add a rule to
          change that.
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="eyebrow px-4 py-3">Buyer country</th>
                <th className="eyebrow px-4 py-3">Currency</th>
                <th className="eyebrow px-4 py-3">Provider</th>
                <th className="eyebrow px-4 py-3">Priority</th>
                <th className="eyebrow px-4 py-3">Status</th>
                <th className="eyebrow px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-[16px] text-ink">{rule.country ?? 'Any country'}</td>
                  <td className="px-4 py-3 text-[16px] text-ink">{rule.currency ?? 'Any'}</td>
                  <td className="px-4 py-3 text-[16px] text-ink">{rule.gatewayName}</td>
                  <td className="px-4 py-3 font-mono text-[16px] text-ink-dim">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <Badge tone={rule.isActive ? 'up' : 'muted'}>{rule.isActive ? 'Active' : 'Paused'}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => toggle(rule)} disabled={busy !== null}>
                        {rule.isActive ? 'Pause' : 'Resume'}
                      </Button>
                      {confirm === rule.id ? (
                        <Button size="sm" variant="danger" onClick={() => remove(rule)} disabled={busy !== null}>
                          Confirm delete
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setConfirm(rule.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={add} className="mt-4 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[1fr_1fr_1.5fr_0.8fr_auto] sm:items-end" noValidate>
        <div>
          <Label htmlFor="rule-country">Country</Label>
          <Input id="rule-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="AE — blank for any" maxLength={2} />
        </div>
        <div>
          <Label htmlFor="rule-currency">Currency</Label>
          <Input id="rule-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="USD — blank for any" maxLength={3} />
        </div>
        <div>
          <Label htmlFor="rule-gateway">Provider</Label>
          <select
            id="rule-gateway"
            value={form.gateway}
            onChange={(e) => setForm({ ...form, gateway: e.target.value })}
            className="h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-[16px] text-ink"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="rule-priority">Priority</Label>
          <Input id="rule-priority" type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
        </div>
        <Button type="submit" disabled={busy !== null || !form.gateway}>
          {busy === 'add' && <Spinner />}
          Add rule
        </Button>
        {error && <p className="text-[15px] text-down sm:col-span-5">{error}</p>}
      </form>
    </div>
  )
}

export function RoutingChecker() {
  const [country, setCountry] = React.useState('')
  const [currency, setCurrency] = React.useState('USD')
  const [busy, setBusy] = React.useState(false)
  const [answer, setAnswer] = React.useState<{ ok: boolean; text: string } | null>(null)

  async function check(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { ok, data } = await send('/api/admin/payment-rules/check', 'POST', { country: country.trim() || undefined, currency })
    setBusy(false)
    if (!ok) return setAnswer({ ok: false, text: errorOf(data, 'Check the codes.') })
    const offered = (data.offered as { name: string }[]).map((entry) => entry.name)
    const who = `A buyer ${data.country ? `in ${data.country} ` : 'anywhere '}paying in ${data.currency}`
    setAnswer(
      offered.length
        ? { ok: true, text: `${who} is offered: ${offered.join(', then ')}.` }
        : { ok: false, text: `${who} is offered no payment method (they can't check out).` },
    )
  }

  return (
    <form onSubmit={check} className="mt-4 rounded-xl border border-line p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="check-country">Buyer country</Label>
          <Input id="check-country" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="AE" maxLength={2} />
        </div>
        <div>
          <Label htmlFor="check-currency">Currency</Label>
          <Input id="check-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy && <Spinner />}
          Check
        </Button>
      </div>
      {answer && (
        <p role="status" className={`mt-3 text-[16px] ${answer.ok ? 'text-ink' : 'text-down'}`}>
          {answer.text}
        </p>
      )}
    </form>
  )
}
