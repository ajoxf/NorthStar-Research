import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  })
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fullName(member: { firstName?: string | null; lastName?: string | null }): string {
  return [member.firstName, member.lastName].filter(Boolean).join(' ')
}

export function initials(member: {
  firstName?: string | null
  lastName?: string | null
  email: string
}): string {
  const name = fullName(member)
  if (name) {
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  }
  return member.email.slice(0, 2).toUpperCase()
}

/** RFC-ish sanity check; real validation is the confirmation email itself. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Normalise to E.164-ish. Returns null when the input clearly is not a phone number. */
export function normalisePhone(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/[^\d+]/g, '')
  const withPlus = digits.startsWith('+') ? digits : `+${digits}`
  if (withPlus.replace(/\D/g, '').length < 8) return null
  return withPlus
}
