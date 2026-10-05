import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { companyDetails } from '@/lib/company'

describe('companyDetails', () => {
  it('unset and placeholder values are treated as missing, never shown', () => {
    const details = companyDetails({ COMPANY_LEGAL_NAME: 'REPLACE_ME', SUPPORT_EMAIL: '' })

    assert.equal(details.legalName, null)
    assert.equal(details.supportEmail, null)
    assert.deepEqual(details.missing, [
      'COMPANY_LEGAL_NAME',
      'COMPANY_ADDRESS',
      'SUPPORT_EMAIL',
      'COMPANY_GOVERNING_LAW',
    ])
  })

  it('set values are trimmed and drop out of the missing list', () => {
    const details = companyDetails({
      COMPANY_LEGAL_NAME: '  NordStar Research Ltd ',
      COMPANY_ADDRESS: '1 Example Street, London',
      SUPPORT_EMAIL: 'support@nordstarpro.com',
      COMPANY_GOVERNING_LAW: 'England and Wales',
    })

    assert.equal(details.legalName, 'NordStar Research Ltd')
    assert.equal(details.supportEmail, 'support@nordstarpro.com')
    assert.deepEqual(details.missing, [])
  })
})
