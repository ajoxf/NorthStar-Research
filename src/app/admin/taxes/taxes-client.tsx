'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type TaxRowView = {
  code: string
  name: string
  label: string
  ratePercent: number
  pricesIncludeTax: boolean
  reverseCharge: boolean
  isActive: boolean
}

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    return response.ok ? { ok: true } : { ok: false, error: data.error ?? 'That could not be saved.' }
  } catch {
    return { ok: false, error: 'Could not reach the server.' }
  }
}

const CELL = 'px-3 py-2.5 align-middle'
const FIELD = 'h-10 w-full rounded-lg border border-line bg-panel-2 px-2.5 text-[16px] text-ink sm:text-[15px]'

/** Every country, one inline form per row: change and Save, or switch on and off in one click. */
export function TaxRows({ rows }: { rows: TaxRowView[] }) {
  return (
    <div className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[920px] text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="eyebrow px-3 py-3">Country</th>
            <th className="eyebrow px-3 py-3">Name on invoice</th>
            <th className="eyebrow px-3 py-3">Short</th>
            <th className="eyebrow px-3 py-3">Rate %</th>
            <th className="eyebrow px-3 py-3">Price incl. tax</th>
            <th className="eyebrow px-3 py-3">Reverse charge (B2B)</th>
            <th className="eyebrow px-3 py-3">Charging</th>
            <th className="eyebrow px-3 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TaxRow key={row.code} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaxRow({ row }: { row: TaxRowView }) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = React.useState(row)
  const [busy, setBusy] = React.useState<'save' | 'toggle' | null>(null)
  React.useEffect(() => setForm(row), [row])

  async function save(next: TaxRowView, how: 'save' | 'toggle') {
    setBusy(how)
    const result = await send(`/api/admin/taxes/${row.code}`, 'PATCH', {
      name: next.name,
      label: next.label,
      ratePercent: Number(next.ratePercent),
      pricesIncludeTax: next.pricesIncludeTax,
      reverseCharge: next.reverseCharge,
      isActive: next.isActive,
    })
    setBusy(null)
    if (!result.ok) return toast(result.error ?? 'That could not be saved.', 'error')
    toast(how === 'toggle' ? `${row.code} ${next.isActive ? 'switched on' : 'switched off'}` : `${row.code} saved`, 'success')
    router.refresh()
  }

  const changed = JSON.stringify(form) !== JSON.stringify(row)
  return (
    <tr className={`border-b border-line/60 last:border-0 ${form.isActive ? '' : 'text-ink-dim'}`}>
      <td className={`${CELL} font-mono text-[16px] text-ink`}>{row.code}</td>
      <td className={CELL}>
        <input aria-label={`${row.code} name on invoice`} className={FIELD} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </td>
      <td className={`${CELL} w-24`}>
        <input aria-label={`${row.code} short name`} className={FIELD} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </td>
      <td className={`${CELL} w-24`}>
        <input
          aria-label={`${row.code} rate percent`}
          className={FIELD}
          type="number"
          min={0}
          max={50}
          step="0.01"
          value={form.ratePercent}
          onChange={(e) => setForm({ ...form, ratePercent: e.target.value === '' ? 0 : Number(e.target.value) })}
        />
      </td>
      <td className={CELL}>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={form.pricesIncludeTax} onChange={(e) => setForm({ ...form, pricesIncludeTax: e.target.checked })} className="h-4 w-4" />
          Included
        </label>
      </td>
      <td className={CELL}>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={form.reverseCharge} onChange={(e) => setForm({ ...form, reverseCharge: e.target.checked })} className="h-4 w-4" />
          With tax ID
        </label>
      </td>
      <td className={CELL}>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" />
          <span className={form.isActive ? 'font-medium text-up' : 'text-ink-dim'}>{form.isActive ? 'On' : 'Off'}</span>
        </label>
      </td>
      <td className={`${CELL} whitespace-nowrap text-right`}>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => save(form, 'save')} disabled={busy !== null || !changed}>
            {busy === 'save' && <Spinner />}
            Save
          </Button>
          <Button size="sm" variant="secondary" onClick={() => save({ ...row, isActive: !row.isActive }, 'toggle')} disabled={busy !== null}>
            {busy === 'toggle' && <Spinner />}
            {row.isActive ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

export function AddTaxCountry() {
  const router = useRouter()
  const toast = useToast()
  const empty = { countryCode: '', name: '', label: 'VAT', ratePercent: '', pricesIncludeTax: true, reverseCharge: false, isActive: false }
  const [form, setForm] = React.useState(empty)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await send('/api/admin/taxes', 'POST', { ...form, ratePercent: Number(form.ratePercent) })
    setBusy(false)
    if (!result.ok) return setError(result.error ?? 'That could not be added.')
    toast(`${form.countryCode.toUpperCase()} added`, 'success')
    setForm(empty)
    router.refresh()
  }

  return (
    <form onSubmit={add} className="mt-4 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-4" noValidate>
      <div>
        <Label htmlFor="tax-code">Country code</Label>
        <Input id="tax-code" value={form.countryCode} maxLength={2} placeholder="QA" onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="tax-name">Name on invoice</Label>
        <Input id="tax-name" value={form.name} placeholder="Qatar VAT" onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="tax-label">Short name</Label>
        <Input id="tax-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="tax-rate">Rate %</Label>
        <Input id="tax-rate" type="number" min={0} max={50} step="0.01" value={form.ratePercent} onChange={(e) => setForm({ ...form, ratePercent: e.target.value })} />
      </div>
      <div className="flex flex-col justify-end gap-2 text-[15px] sm:col-span-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.pricesIncludeTax} onChange={(e) => setForm({ ...form, pricesIncludeTax: e.target.checked })} className="h-4 w-4" />
          Price includes tax
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.reverseCharge} onChange={(e) => setForm({ ...form, reverseCharge: e.target.checked })} className="h-4 w-4" />
          Reverse charge for businesses with a tax ID
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" />
          Charge now
        </label>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={busy}>
          {busy && <Spinner />}
          Add country
        </Button>
      </div>
      {error && <p className="text-[15px] text-down sm:col-span-4">{error}</p>}
    </form>
  )
}
