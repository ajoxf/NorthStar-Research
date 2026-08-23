import { normalisePhone } from '@/lib/utils'

/**
 * A member's two numbers, resolved from what a form actually submitted.
 *
 * The old field asked for "WhatsApp **or** phone number", which produced one value and no
 * record of which it was — so the desk could not tell whether a number was reachable on
 * WhatsApp without trying it. These are now two questions, with the common case ("they
 * are the same") answered by a checkbox rather than by typing the number twice.
 *
 * `whatsappNumber` stays null when WhatsApp is on the mobile. Storing a duplicate would
 * make "has a separate WhatsApp line" unanswerable later, and every subsequent edit would
 * have to keep two copies in step.
 */
export type ContactNumbers = {
  phoneNumber: string | null
  whatsappNumber: string | null
  whatsappOptIn: boolean
}

export type ContactNumbersInput = {
  phoneNumber?: string | null
  /** True when WhatsApp is the same line as the mobile. */
  whatsappSameAsPhone?: boolean
  whatsappNumber?: string | null
}

export function resolveContactNumbers(input: ContactNumbersInput): ContactNumbers {
  const phoneNumber = input.phoneNumber ? normalisePhone(input.phoneNumber) : null

  if (input.whatsappSameAsPhone !== false) {
    // WhatsApp is the mobile. Opt-in only if there is actually a mobile to reach.
    return { phoneNumber, whatsappNumber: null, whatsappOptIn: phoneNumber !== null }
  }

  const whatsappNumber = input.whatsappNumber ? normalisePhone(input.whatsappNumber) : null

  // A separate line that happens to match the mobile collapses back to the simple case,
  // so the two never drift apart in the record.
  if (whatsappNumber && whatsappNumber === phoneNumber) {
    return { phoneNumber, whatsappNumber: null, whatsappOptIn: true }
  }

  return { phoneNumber, whatsappNumber, whatsappOptIn: whatsappNumber !== null }
}

/** The number to actually message on WhatsApp, or null if there isn't one. */
export function whatsappNumberFor(member: {
  phoneNumber: string | null
  whatsappNumber: string | null
  whatsappOptIn: boolean
}): string | null {
  if (member.whatsappNumber) return member.whatsappNumber
  return member.whatsappOptIn ? member.phoneNumber : null
}

/** Which channels this member can actually be reached on. Email is always one. */
export function channelsFor(member: {
  phoneNumber: string | null
  whatsappNumber: string | null
  whatsappOptIn: boolean
}): ('email' | 'whatsapp' | 'phone')[] {
  const channels: ('email' | 'whatsapp' | 'phone')[] = ['email']
  if (whatsappNumberFor(member)) channels.push('whatsapp')
  if (member.phoneNumber) channels.push('phone')
  return channels
}
