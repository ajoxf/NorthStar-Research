import { randomInt } from 'crypto'

/**
 * Redemption code alphabet.
 *
 * Deliberately excludes 0/O and 1/I/L — codes get read off a phone screen and typed
 * by hand, and those pairs are the usual source of "my code doesn't work" support.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function block(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

/** e.g. NSR-4KFP-9TQX */
export function generateRedemptionCode(): string {
  return `NSR-${block(4)}-${block(4)}`
}

/** Accepts user input in any case/spacing and normalises it to canonical form. */
export function normaliseCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^NSR/, '')
  if (cleaned.length !== 8) return input.trim().toUpperCase()
  return `NSR-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`
}
