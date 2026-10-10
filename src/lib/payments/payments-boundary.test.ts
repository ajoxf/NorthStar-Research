import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'

import { METHOD_PROVIDER, PAYMENT_PROVIDER_IDS, isPaymentProviderId } from '@/lib/payments/ids'

const SRC = join(process.cwd(), 'src')
const PAYMENTS = join(SRC, 'lib', 'payments')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

/*
 * The seam only holds if nothing goes round it. The vendor SDK, and the low-level vendor
 * modules, are reachable from inside src/lib/payments/ and nowhere else — except the type
 * import the Stripe webhook route needs to read Stripe's event shapes, and the admin
 * routes that manage Stripe prices and test payments, which are Stripe's own settings.
 */
const VENDOR_IMPORT = /from ['"](stripe|@\/lib\/payments\/(stripe|cregis))['"]/

const ALLOWED_OUTSIDE = new Set([
  'app/api/webhooks/stripe/route.ts',
  'app/api/admin/packages/resolve-price.ts',
  'app/api/admin/payments/check/route.ts',
  'app/api/admin/payments/test/route.ts',
  'app/api/account/billing/route.ts',
])

describe('the payments boundary', () => {
  it('keeps the Stripe SDK inside src/lib/payments', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.startsWith(PAYMENTS))
      .filter((file) => /from ['"]stripe['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
    assert.deepEqual(offenders, [])
  })

  it('reaches vendor modules only from the payments folder and the named exceptions', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.startsWith(PAYMENTS) && !file.endsWith('.test.ts'))
      .filter((file) => VENDOR_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .filter((file) => !ALLOWED_OUTSIDE.has(file))
    assert.deepEqual(offenders, [])
  })
})

describe('provider ids', () => {
  it('maps the old method names onto registered rails', () => {
    for (const id of Object.values(METHOD_PROVIDER)) assert.equal(isPaymentProviderId(id), true)
    assert.deepEqual([...PAYMENT_PROVIDER_IDS], ['stripe', 'cregis'])
    assert.equal(isPaymentProviderId('paypal'), false)
  })
})
