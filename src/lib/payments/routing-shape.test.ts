import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_RULES, normaliseCountry, normaliseCurrency, rankProviders, type RouteRule } from '@/lib/payments/routing-shape'

const rule = (gateway: string, priority: number, countryCode: string | null = null, currency: string | null = null): RouteRule => ({
  gateway,
  priority,
  countryCode,
  currency,
  isActive: true,
})

const TAP_CURRENCIES = ['AED', 'SAR', 'KWD', 'BHD', 'QAR', 'OMR', 'EGP', 'USD', 'EUR', 'GBP']
const usable = (currency: string) => (gateway: string) => gateway !== 'tap' || TAP_CURRENCIES.includes(currency)

describe('rankProviders', () => {
  const rules = [rule('stripe', 100), rule('tap', 5, 'AE')]

  it('offers the most specific rule first', () => {
    assert.deepEqual(rankProviders(rules, 'AE', 'USD', usable('USD')), ['tap', 'stripe'])
  })
  it('leaves out rules for other countries', () => {
    assert.deepEqual(rankProviders(rules, 'GB', 'USD', usable('USD')), ['stripe'])
  })
  it('skips a provider that cannot charge the currency', () => {
    assert.deepEqual(rankProviders(rules, 'AE', 'INR', usable('INR')), ['stripe'])
  })
  it('ranks country+currency above country above currency above any, then priority', () => {
    const many = [rule('any', 1), rule('cur', 50, null, 'USD'), rule('cty', 90, 'AE'), rule('both', 99, 'AE', 'USD'), rule('cty2', 10, 'AE')]
    assert.deepEqual(rankProviders(many, 'ae', 'usd', () => true), ['both', 'cty2', 'cty', 'cur', 'any'])
  })
  it('lists each provider once and ignores paused rules', () => {
    const many = [rule('stripe', 1, 'AE'), rule('stripe', 100), { ...rule('cregis', 1), isActive: false }]
    assert.deepEqual(rankProviders(many, 'AE', 'USD', () => true), ['stripe'])
  })
  it('falls back to card then crypto', () => {
    assert.deepEqual(rankProviders(DEFAULT_RULES, null, 'USD', () => true), ['stripe', 'cregis'])
  })
  it('offers nothing when nothing is usable', () => {
    assert.deepEqual(rankProviders(rules, 'AE', 'USD', () => false), [])
  })
})

describe('codes', () => {
  it('accepts two- and three-letter codes, blank as any, and refuses the rest', () => {
    assert.equal(normaliseCountry(' ae '), 'AE')
    assert.equal(normaliseCountry(''), null)
    assert.equal(normaliseCountry('UAE'), undefined)
    assert.equal(normaliseCurrency('usd'), 'USD')
    assert.equal(normaliseCurrency('US'), undefined)
  })
})
