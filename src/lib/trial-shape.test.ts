import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseNewSectionsOpen } from '@/lib/trial-shape'

describe('parseNewSectionsOpen', () => {
  it('is on when nothing has been saved', () => {
    assert.equal(parseNewSectionsOpen(null), true)
    assert.equal(parseNewSectionsOpen(undefined), true)
  })

  it('is off only when explicitly turned off', () => {
    assert.equal(parseNewSectionsOpen('false'), false)
    assert.equal(parseNewSectionsOpen('true'), true)
  })
})
