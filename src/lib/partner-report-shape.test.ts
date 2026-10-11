import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  centsToDecimal,
  csv,
  csvCell,
  dailySeries,
  maskEmail,
  maskName,
  parsePeriod,
  percentOf,
  periodStart,
} from './partner-report-shape'

describe('maskName', () => {
  it('keeps the first name and the last initial', () => {
    assert.equal(maskName('Sarah', 'khan', 'sk@example.com'), 'Sarah K.')
  })
  it('shows a single name as it is', () => {
    assert.equal(maskName('Sarah', null, 'sk@example.com'), 'Sarah')
    assert.equal(maskName('  ', 'Khan', 'sk@example.com'), 'Khan')
  })
  it('falls back to the first letter of the email', () => {
    assert.equal(maskName(null, null, 'jane@example.com'), 'J•••')
  })
})

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    assert.equal(maskEmail('jane.doe@gmail.com'), 'j•••@gmail.com')
  })
  it('hides anything that is not an address', () => {
    assert.equal(maskEmail('nonsense'), '•••')
  })
})

describe('parsePeriod', () => {
  it('accepts only the offered periods', () => {
    assert.equal(parsePeriod('90'), 90)
    assert.equal(parsePeriod('45'), 30)
    assert.equal(parsePeriod(undefined, 7), 7)
    assert.equal(parsePeriod(['365']), 365)
  })
})

describe('dailySeries', () => {
  const now = new Date('2026-10-11T15:00:00Z')
  it('has one point per day, oldest first, zero-filled', () => {
    const series = dailySeries([], 7, now)
    assert.equal(series.length, 7)
    assert.equal(series[0].day, '2026-10-05')
    assert.equal(series[6].day, '2026-10-11')
    assert.ok(series.every((point) => point.value === 0))
  })
  it('counts events and sums values into their day, ignoring ones outside', () => {
    const series = dailySeries(
      [
        { at: new Date('2026-10-11T01:00:00Z') },
        { at: new Date('2026-10-11T23:00:00Z') },
        { at: new Date('2026-10-06T10:00:00Z'), value: 250 },
        { at: new Date('2026-09-01T10:00:00Z'), value: 999 },
      ],
      7,
      now,
    )
    assert.equal(series[6].value, 2)
    assert.equal(series[1].value, 250)
    assert.equal(series.reduce((sum, point) => sum + point.value, 0), 252)
  })
  it('starts the period at midnight UTC', () => {
    assert.equal(periodStart(1, now).toISOString(), '2026-10-11T00:00:00.000Z')
  })
})

describe('csv', () => {
  it('quotes every field and doubles quotes', () => {
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csv(['a', 'b'], [[1, null]]), '"a","b"\r\n"1",""\r\n')
  })
  it('defuses anything a spreadsheet would run as a formula', () => {
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
    assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`)
    // A negative amount passed as a number is a number, not a formula.
    assert.equal(csvCell(-5), '"-5"')
    assert.equal(csvCell('-20.00'), '"-20.00"')
    assert.equal(csvCell('-1+1'), `"'-1+1"`)
  })
  it('writes cents as decimals', () => {
    assert.equal(centsToDecimal(12345), '123.45')
    assert.equal(centsToDecimal(-50), '-0.50')
    assert.equal(centsToDecimal(0), '0.00')
  })
})

describe('percentOf', () => {
  it('rounds, and is null without a denominator', () => {
    assert.equal(percentOf(1, 3), 33)
    assert.equal(percentOf(1, 0), null)
  })
})
