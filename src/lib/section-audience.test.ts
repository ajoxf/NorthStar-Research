import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SECTION_AUDIENCES, sectionAudienceLabel } from '@/lib/section-audience'

describe('sectionAudienceLabel', () => {
  it('shows the stored retail value as Starter', () => {
    assert.equal(sectionAudienceLabel('retail'), 'Starter')
    assert.equal(sectionAudienceLabel('institutional'), 'Institutional')
  })

  it('keeps the stored values as they are in the database', () => {
    assert.deepEqual([...SECTION_AUDIENCES], ['retail', 'institutional'])
  })
})
