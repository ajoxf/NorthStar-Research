/** Checking what an admin typed for a payment-link provider. Pure, so it is tested. */

export type CustomInput = {
  name: string
  label: string
  payUrl: string | null
  instructions: string | null
  currencies: string[]
}

/** "Ziina Pay" → "custom-ziina-pay". Unique among `taken` by a numbered suffix. */
export function customIdFor(name: string, taken: string[]): string {
  const slug =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34) || 'provider'
  let id = `custom-${slug}`
  for (let n = 2; taken.includes(id); n += 1) id = `custom-${slug}-${n}`
  return id
}

export const CUSTOM_ID = /^custom-[a-z0-9-]{1,40}$/

export function validateCustom(raw: {
  name?: unknown
  label?: unknown
  payUrl?: unknown
  instructions?: unknown
  currencies?: unknown
}): { ok: true; value: CustomInput } | { ok: false; error: string } {
  const name = String(raw.name ?? '').trim()
  if (!name) return { ok: false, error: 'Give the provider a name.' }
  if (name.length > 60) return { ok: false, error: 'The name is too long.' }

  const label = String(raw.label ?? '').trim() || `Pay with ${name}`
  if (label.length > 60) return { ok: false, error: 'The button text is too long.' }

  const payUrl = String(raw.payUrl ?? '').trim() || null
  if (payUrl) {
    if (payUrl.length > 1000) return { ok: false, error: 'The payment link is too long.' }
    let url: URL
    try {
      // Placeholders are not valid in every URL part, so check the shape with them filled.
      url = new URL(payUrl.replace(/\{[a-z_]+\}/g, 'x'))
    } catch {
      return { ok: false, error: 'The payment link is not a valid address.' }
    }
    if (url.protocol !== 'https:') return { ok: false, error: 'The payment link must start with https://.' }
    const unknown = payUrl.match(/\{[^}]*\}/g)?.filter((token) => !KNOWN.includes(token))
    if (unknown?.length) return { ok: false, error: `Unknown placeholder ${unknown[0]}. Use: ${KNOWN.join(' ')}.` }
  }

  const instructions = String(raw.instructions ?? '').trim() || null
  if (instructions && instructions.length > 2000) return { ok: false, error: 'The instructions are too long.' }
  if (!payUrl && !instructions) return { ok: false, error: 'Add a payment link, instructions, or both — buyers need to know how to pay.' }

  const list = Array.isArray(raw.currencies) ? raw.currencies : String(raw.currencies ?? '').split(/[\s,]+/)
  const currencies = [...new Set(list.map((code) => String(code).trim().toUpperCase()).filter(Boolean))]
  const bad = currencies.find((code) => !/^[A-Z]{3}$/.test(code))
  if (bad) return { ok: false, error: `${bad} is not a three-letter currency code.` }

  return { ok: true, value: { name, label, payUrl, instructions, currencies } }
}

const KNOWN = ['{amount}', '{amount_minor}', '{currency}', '{order_number}', '{order_id}', '{email}']
