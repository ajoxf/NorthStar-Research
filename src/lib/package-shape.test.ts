import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FALLBACK_PACKAGE,
  addPeriod,
  amountString,
  formatPrice,
  isFallbackPackage,
  packageInputSchema,
  parseFeatures,
  parsePriceCents,
  priceLine,
  slugifyPackage,
  sortPackages,
  stripePriceMismatch,
} from '@/lib/package-shape'

test('the fallback package is the plan the site sold before packages existed', () => {
  // The point of this feature being additive: with no package created, nothing changes.
  assert.equal(FALLBACK_PACKAGE.priceCents, 19900)
  assert.equal(FALLBACK_PACKAGE.currency, 'USD')
  assert.equal(FALLBACK_PACKAGE.interval, 'month')
  assert.equal(formatPrice(FALLBACK_PACKAGE.priceCents), '$199')
  assert.ok(isFallbackPackage(FALLBACK_PACKAGE))
  assert.ok(!isFallbackPackage({ id: 'clx123' }))
})

test('whole prices lose the decimals, part prices keep both', () => {
  assert.equal(formatPrice(19900), '$199')
  assert.equal(formatPrice(24950), '$249.50')
  // Never "$249.5" — that is not a price.
  assert.equal(formatPrice(24950).split('.')[1]?.length, 2)
  assert.equal(formatPrice(1000, 'EUR'), '10 EUR')
})

test('the processor amount always carries two decimal places', () => {
  assert.equal(amountString(19900), '199.00')
  assert.equal(amountString(24950), '249.50')
  assert.equal(amountString(100), '1.00')
})

test('priceLine is the whole price sentence', () => {
  assert.equal(priceLine({ priceCents: 19900, currency: 'USD', interval: 'month' }), '$199 / month')
  assert.equal(priceLine({ priceCents: 199000, currency: 'USD', interval: 'year' }), '$1990 / year')
})

test('price parsing refuses anything that is not plainly an amount', () => {
  assert.equal(parsePriceCents('199'), 19900)
  assert.equal(parsePriceCents('$199'), 19900)
  assert.equal(parsePriceCents(' 249.50 '), 24950)
  assert.equal(parsePriceCents('1,999'), 199900)
  assert.equal(parsePriceCents('249.5'), 24950)

  // parseFloat would read each of these as a number, which is exactly the failure this
  // guards: a price misread by a factor of a thousand is caught by the first buyer, not
  // by anyone in the admin console.
  assert.equal(parsePriceCents('199abc'), null)
  assert.equal(parsePriceCents('1e3'), null)
  assert.equal(parsePriceCents('-199'), null)
  assert.equal(parsePriceCents('199.999'), null)
  assert.equal(parsePriceCents(''), null)
})

test('slugs are URL-safe and bounded', () => {
  assert.equal(slugifyPackage('NordStar Pro Membership'), 'nordstar-pro-membership')
  assert.equal(slugifyPackage('Pro — annual!'), 'pro-annual')
  assert.equal(slugifyPackage('  '), '')
  assert.ok(slugifyPackage('x'.repeat(200)).length <= 48)
})

test('a monthly period rolls the calendar the way billing systems do', () => {
  assert.equal(
    addPeriod('month', new Date('2026-01-31T00:00:00Z')).toISOString().slice(0, 10),
    '2026-03-03',
  )
  assert.equal(
    addPeriod('year', new Date('2026-08-17T00:00:00Z')).toISOString().slice(0, 10),
    '2027-08-17',
  )
})

test('packages sort by order then name, never arbitrarily', () => {
  const sorted = sortPackages([
    { sortOrder: 1, name: 'Zeta' },
    { sortOrder: 0, name: 'Beta' },
    { sortOrder: 1, name: 'Alpha' },
  ])
  assert.deepEqual(
    sorted.map((pkg) => pkg.name),
    ['Beta', 'Alpha', 'Zeta'],
  )
})

test('feature bullets come off a textarea one per line, bullets stripped', () => {
  assert.deepEqual(parseFeatures('One\n- Two\n\n• Three  \n'), ['One', 'Two', 'Three'])
  assert.equal(parseFeatures(Array.from({ length: 30 }, (_, i) => `f${i}`).join('\n')).length, 12)
})

const MONTHLY = { priceCents: 19900, currency: 'USD', interval: 'month' } as const

test('a matching Stripe price is accepted', () => {
  assert.equal(
    stripePriceMismatch(MONTHLY, {
      active: true,
      type: 'recurring',
      unitAmount: 19900,
      currency: 'usd',
      interval: 'month',
    }),
    null,
  )
})

test('every way a Stripe price can betray the advertised one is caught', () => {
  const base = { active: true, type: 'recurring', unitAmount: 19900, currency: 'usd', interval: 'month' }

  // The headline case: the page says $199, Stripe charges $299, and the buyer is charged
  // what Stripe says. Nothing else in the system would notice.
  assert.match(
    stripePriceMismatch(MONTHLY, { ...base, unitAmount: 29900 }) ?? '',
    /charged what Stripe says/,
  )
  assert.match(stripePriceMismatch(MONTHLY, { ...base, active: false }) ?? '', /archived/)
  assert.match(stripePriceMismatch(MONTHLY, { ...base, type: 'one_time' }) ?? '', /one-off/)
  assert.match(stripePriceMismatch(MONTHLY, { ...base, interval: 'year' }) ?? '', /every year/)
  assert.match(stripePriceMismatch(MONTHLY, { ...base, currency: 'eur' }) ?? '', /EUR/)

  // A missing amount must never read as "matches".
  assert.notEqual(stripePriceMismatch(MONTHLY, { ...base, unitAmount: null }), null)
})

test('the input schema refuses prices that would be a typo or a giveaway', () => {
  const valid = {
    name: 'Pro',
    priceCents: 19900,
    currency: 'USD',
    interval: 'month',
    features: [],
    sortOrder: 0,
  }
  assert.ok(packageInputSchema.safeParse(valid).success)

  assert.ok(!packageInputSchema.safeParse({ ...valid, priceCents: 0 }).success)
  assert.ok(!packageInputSchema.safeParse({ ...valid, priceCents: 50 }).success)
  assert.ok(!packageInputSchema.safeParse({ ...valid, priceCents: 99_999_999 }).success)
  assert.ok(!packageInputSchema.safeParse({ ...valid, name: 'x' }).success)
  assert.ok(!packageInputSchema.safeParse({ ...valid, interval: 'week' }).success)
})

test('card selling is on by default, and is stated rather than inferred from a blank ID', () => {
  const parsed = packageInputSchema.parse({
    name: 'Pro',
    priceCents: 19900,
    currency: 'USD',
    interval: 'month',
    features: [],
    sortOrder: 0,
  })
  // With the app creating prices itself, an empty price ID no longer means "not for sale
  // by card" — so intent has its own field and defaults to selling.
  assert.equal(parsed.sellByCard, true)
  assert.equal(parsed.stripePriceId, undefined)

  assert.equal(
    packageInputSchema.parse({
      name: 'Pro',
      priceCents: 19900,
      currency: 'USD',
      interval: 'month',
      features: [],
      sortOrder: 0,
      sellByCard: false,
    }).sellByCard,
    false,
  )
})

test('a Stripe price ID is checked for shape before a round trip is spent on it', () => {
  const valid = {
    name: 'Pro',
    priceCents: 19900,
    currency: 'USD',
    interval: 'month',
    features: [],
    sortOrder: 0,
  }
  assert.ok(packageInputSchema.safeParse({ ...valid, stripePriceId: 'price_1A2b3C' }).success)
  // A product ID and a payment-link URL are the two things people paste by mistake.
  assert.ok(!packageInputSchema.safeParse({ ...valid, stripePriceId: 'prod_1A2b3C' }).success)
  assert.ok(
    !packageInputSchema.safeParse({ ...valid, stripePriceId: 'https://buy.stripe.com/x' }).success,
  )
})
