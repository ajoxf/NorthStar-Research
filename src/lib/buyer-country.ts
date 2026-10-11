import 'server-only'

import { headers } from 'next/headers'

import { getCurrentMember } from '@/lib/auth'
import { normaliseCountry } from '@/lib/payments/routing-shape'
import { HOME_COUNTRY } from '@/lib/tax'

/**
 * The buyer's billing country: what they chose at checkout; otherwise the country saved on
 * their account from last time; otherwise where the request came from (Vercel's geo
 * header); otherwise the home country. A guess is a default for the form, never a lock — a
 * buyer abroad picks their own, and it decides both their tax and their ways to pay.
 */
export async function buyerCountry(chosen?: unknown): Promise<string> {
  const picked = normaliseCountry(chosen)
  if (picked) return picked
  const member = await getCurrentMember().catch(() => null)
  const saved = normaliseCountry(member?.billingCountry)
  if (saved) return saved
  const list = headers()
  return normaliseCountry(list.get('x-vercel-ip-country') ?? list.get('cf-ipcountry')) ?? HOME_COUNTRY
}
