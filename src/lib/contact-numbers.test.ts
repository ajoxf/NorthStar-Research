import assert from 'node:assert/strict'
import test from 'node:test'

import { channelsFor, resolveContactNumbers, whatsappNumberFor } from '@/lib/contact-numbers'

test('the common case — one line for both — stores the number once', () => {
  const result = resolveContactNumbers({
    phoneNumber: '+1 555 000 0000',
    whatsappSameAsPhone: true,
  })
  assert.deepEqual(result, {
    phoneNumber: '+15550000000',
    // Never a duplicate: storing it twice would make "has a separate WhatsApp line"
    // unanswerable, and every later edit would have to keep two copies in step.
    whatsappNumber: null,
    whatsappOptIn: true,
  })
})

test('a separate WhatsApp line is kept separately', () => {
  const result = resolveContactNumbers({
    phoneNumber: '+1 555 000 0000',
    whatsappSameAsPhone: false,
    whatsappNumber: '+44 7700 900123',
  })
  assert.equal(result.phoneNumber, '+15550000000')
  assert.equal(result.whatsappNumber, '+447700900123')
  assert.equal(result.whatsappOptIn, true)
})

test('a "separate" number that is really the same one collapses back', () => {
  // Typed differently, same line. Keeping both would let them drift apart on the next edit.
  const result = resolveContactNumbers({
    phoneNumber: '+1 555 000 0000',
    whatsappSameAsPhone: false,
    whatsappNumber: '+1 (555) 000-0000',
  })
  assert.equal(result.whatsappNumber, null)
  assert.equal(result.whatsappOptIn, true)
})

test('no WhatsApp given means no WhatsApp claimed', () => {
  const result = resolveContactNumbers({
    phoneNumber: '+1 555 000 0000',
    whatsappSameAsPhone: false,
    whatsappNumber: '',
  })
  assert.equal(result.whatsappNumber, null)
  // The mobile is known but nobody said it reaches WhatsApp, so we must not assume it.
  assert.equal(result.whatsappOptIn, false)
})

test('no numbers at all opts nobody in', () => {
  const result = resolveContactNumbers({ phoneNumber: '', whatsappSameAsPhone: true })
  assert.deepEqual(result, { phoneNumber: null, whatsappNumber: null, whatsappOptIn: false })
})

test('an unusable number is rejected rather than stored as junk', () => {
  assert.equal(resolveContactNumbers({ phoneNumber: '123' }).phoneNumber, null)
})

test('the number to actually message resolves from either field', () => {
  assert.equal(
    whatsappNumberFor({ phoneNumber: '+15550000000', whatsappNumber: null, whatsappOptIn: true }),
    '+15550000000',
  )
  assert.equal(
    whatsappNumberFor({
      phoneNumber: '+15550000000',
      whatsappNumber: '+447700900123',
      whatsappOptIn: true,
    }),
    '+447700900123',
  )
  // A mobile with no opt-in is not a WhatsApp number.
  assert.equal(
    whatsappNumberFor({ phoneNumber: '+15550000000', whatsappNumber: null, whatsappOptIn: false }),
    null,
  )
})

test('channels reflect what we can actually reach them on', () => {
  assert.deepEqual(
    channelsFor({ phoneNumber: null, whatsappNumber: null, whatsappOptIn: false }),
    ['email'],
  )
  assert.deepEqual(
    channelsFor({ phoneNumber: '+15550000000', whatsappNumber: null, whatsappOptIn: false }),
    ['email', 'phone'],
  )
  assert.deepEqual(
    channelsFor({ phoneNumber: '+15550000000', whatsappNumber: null, whatsappOptIn: true }),
    ['email', 'whatsapp', 'phone'],
  )
  assert.deepEqual(
    channelsFor({ phoneNumber: null, whatsappNumber: '+447700900123', whatsappOptIn: true }),
    ['email', 'whatsapp'],
  )
})
