import 'server-only'

import { headers } from 'next/headers'

import { normaliseCountry } from '@/lib/payments/routing-shape'

/**
 * The buyer's billing country: what they chose at checkout, otherwise where the request
 * came from (Vercel's geo header), otherwise unknown — which matches only "any country"
 * rules. A guess from the address is a default for the form, never a lock: a buyer abroad
 * picks their own.
 */
export function buyerCountry(chosen?: unknown): string | null {
  const picked = normaliseCountry(chosen)
  if (picked) return picked
  const list = headers()
  return normaliseCountry(list.get('x-vercel-ip-country') ?? list.get('cf-ipcountry')) ?? null
}
