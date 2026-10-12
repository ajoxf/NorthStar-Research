/**
 * Saved payout details: what counts as valid, how they are shown masked, and how they are
 * written onto a withdrawal.
 *
 * Pure, so each rule is tested without a database. The checks are there to catch a typo
 * before money goes to the wrong place — an IBAN's own checksum, an email that is not one —
 * not to prove an account exists. The approval step is still where a person looks.
 */

import { maskEmail } from '@/lib/partner-report-shape'

export const PAYOUT_METHODS = ['bank', 'paypal', 'wise', 'crypto'] as const
export type PayoutMethodValue = (typeof PAYOUT_METHODS)[number]

export const METHOD_LABEL: Record<PayoutMethodValue, string> = {
  bank: 'Bank transfer',
  paypal: 'PayPal',
  wise: 'Wise',
  crypto: 'Crypto wallet',
}

export type PayoutDetailsInput = {
  method: PayoutMethodValue
  holderName: string
  account: string
  routing?: string | null
  bankName?: string | null
}

export type PayoutDetailsFields = {
  method: PayoutMethodValue
  holderName: string
  account: string
  routing: string | null
  bankName: string | null
}

export type ValidationResult =
  | { ok: true; value: PayoutDetailsFields }
  | { ok: false; error: string; field: 'method' | 'holderName' | 'account' | 'routing' | 'bankName' }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SWIFT = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/
const IBAN_SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/

/** An IBAN's mod-97 check: catches a mistyped or transposed digit, the commonest slip. */
export function ibanChecksumOk(iban: string): boolean {
  const compact = iban.replace(/\s+/g, '').toUpperCase()
  if (!IBAN_SHAPE.test(compact)) return false
  const rearranged = compact.slice(4) + compact.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** Looks like an IBAN (country letters then check digits), as opposed to a local account number. */
function looksLikeIban(value: string): boolean {
  return /^[A-Za-z]{2}[0-9]{2}/.test(value.replace(/\s+/g, ''))
}

export function validatePayoutDetails(input: PayoutDetailsInput): ValidationResult {
  if (!PAYOUT_METHODS.includes(input.method)) return { ok: false, error: 'Choose how you want to be paid.', field: 'method' }
  const holderName = input.holderName.trim().replace(/\s+/g, ' ')
  if (holderName.length < 2 || holderName.length > 120) {
    return { ok: false, error: 'Enter the name on the account.', field: 'holderName' }
  }
  const routingRaw = (input.routing ?? '').trim()
  const bankName = (input.bankName ?? '').trim().slice(0, 120) || null
  let account = input.account.trim()

  switch (input.method) {
    case 'bank': {
      const compact = account.replace(/\s+/g, '').toUpperCase()
      if (looksLikeIban(compact)) {
        if (!ibanChecksumOk(compact)) return { ok: false, error: 'That IBAN does not check out — look for a mistyped character.', field: 'account' }
        account = compact
      } else if (!/^[A-Za-z0-9 -]{4,40}$/.test(account)) {
        return { ok: false, error: 'Enter your IBAN or account number.', field: 'account' }
      }
      const swift = routingRaw.replace(/\s+/g, '').toUpperCase()
      if (swift && !SWIFT.test(swift)) return { ok: false, error: 'A SWIFT/BIC code is 8 or 11 letters and numbers.', field: 'routing' }
      return { ok: true, value: { method: 'bank', holderName, account, routing: swift || null, bankName } }
    }
    case 'paypal':
    case 'wise': {
      const email = account.toLowerCase()
      if (!EMAIL.test(email) || email.length > 200) {
        return { ok: false, error: `Enter the email address of your ${METHOD_LABEL[input.method]} account.`, field: 'account' }
      }
      return { ok: true, value: { method: input.method, holderName, account: email, routing: null, bankName: null } }
    }
    case 'crypto': {
      if (!/^[A-Za-z0-9:_-]{20,120}$/.test(account)) return { ok: false, error: 'Enter the wallet address, with no spaces.', field: 'account' }
      if (routingRaw.length < 2 || routingRaw.length > 60) {
        return { ok: false, error: 'Say which coin and network, e.g. USDT on TRON (TRC-20).', field: 'routing' }
      }
      return { ok: true, value: { method: 'crypto', holderName, account, routing: routingRaw, bankName: null } }
    }
  }
}

/** The account as shown back to its owner, and anywhere else on screen: enough to recognise, not to copy. */
export function maskAccount(method: PayoutMethodValue, account: string): string {
  if (method === 'paypal' || method === 'wise') return maskEmail(account)
  const compact = account.replace(/\s+/g, '')
  if (method === 'crypto') return compact.length > 10 ? `${compact.slice(0, 4)}…${compact.slice(-4)}` : '••••'
  return `••••${compact.slice(-4)}`
}

/** "PayPal · j•••@gmail.com" or "Bank transfer · ••••1234 · Barclays". */
export function describePayoutDetails(details: Pick<PayoutDetailsFields, 'method' | 'account' | 'routing' | 'bankName'>): string {
  const parts = [METHOD_LABEL[details.method], maskAccount(details.method, details.account)]
  if (details.method === 'bank' && details.bankName) parts.push(details.bankName)
  if (details.method === 'crypto' && details.routing) parts.push(details.routing)
  return parts.join(' · ')
}

/**
 * The full details, written onto a withdrawal as its destination. In full, because the
 * person who sends the money needs every character — and a snapshot, so a later change to
 * the saved details does not rewrite where an approved withdrawal was meant to go.
 */
export function destinationFrom(details: PayoutDetailsFields): string {
  switch (details.method) {
    case 'bank':
      return [
        `Bank transfer to ${details.holderName}`,
        `${looksLikeIban(details.account) ? 'IBAN' : 'Account'} ${details.account}`,
        details.routing ? `SWIFT ${details.routing}` : null,
        details.bankName,
      ]
        .filter(Boolean)
        .join('; ')
    case 'paypal':
    case 'wise':
      return `${METHOD_LABEL[details.method]} ${details.account} (${details.holderName})`
    case 'crypto':
      return `${details.routing}: ${details.account} (${details.holderName})`
  }
}
