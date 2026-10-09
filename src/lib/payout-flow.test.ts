import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  canTransition,
  isFinal,
  nextStatuses,
  reducesBalance,
  selfApproved,
  type PayoutStatusValue,
} from '@/lib/payout-flow'

const ALL: PayoutStatusValue[] = ['requested', 'approved', 'rejected', 'sent', 'settled', 'failed']

describe('the approval gate', () => {
  it('REFUSES requested → sent', () => {
    /*
     * The whole control, in one assertion. Approval is a separate act by a named person,
     * not a formality on the way out — allowing this jump would mean a single request could
     * move money, which is precisely what the approval step exists to prevent.
     */
    assert.equal(canTransition('requested', 'sent'), false)
  })

  it('allows the two-step route', () => {
    assert.equal(canTransition('requested', 'approved'), true)
    assert.equal(canTransition('approved', 'sent'), true)
  })

  it('cannot be reached from anywhere except approved', () => {
    // Belt and braces: no state other than `approved` may lead to `sent`.
    for (const from of ALL) {
      if (from === 'approved') continue
      assert.equal(canTransition(from, 'sent'), false, `${from} must not reach sent`)
    }
  })
})

describe('transitions', () => {
  it('lets a request be turned down, and an approval withdrawn', () => {
    assert.equal(canTransition('requested', 'rejected'), true)
    assert.equal(canTransition('approved', 'rejected'), true)
  })

  it('treats rejected and settled as the end', () => {
    // A rejected payout is reopened by requesting a new one, so what was turned down and
    // why survives on the record rather than being overwritten.
    assert.equal(isFinal('rejected'), true)
    assert.equal(isFinal('settled'), true)
  })

  it('sends a failure back for approval rather than straight to another attempt', () => {
    // A retry is a deliberate act on something a person has looked at, not a loop a stuck
    // job can spin in.
    assert.deepEqual(nextStatuses('failed'), ['approved'])
    assert.equal(canTransition('failed', 'sent'), false)
  })

  it('never allows a move to the state it is already in', () => {
    for (const status of ALL) {
      assert.equal(canTransition(status, status), false, `${status} → ${status}`)
    }
  })

  it('never goes backwards from sent to approved', () => {
    assert.equal(canTransition('sent', 'approved'), false)
    assert.equal(canTransition('sent', 'requested'), false)
  })
})

describe('reducesBalance', () => {
  it('debits only once the money has left', () => {
    /*
     * A payout debits on `sent`, not on `approved`. An approved payout that is never sent
     * would otherwise hold money out of a contributor's balance indefinitely, and a
     * rejected one would have to be credited back — a second entry for a thing that never
     * happened.
     */
    assert.equal(reducesBalance('sent'), true)
    assert.equal(reducesBalance('settled'), true)
    assert.equal(reducesBalance('approved'), false)
    assert.equal(reducesBalance('requested'), false)
    assert.equal(reducesBalance('rejected'), false)
  })

  it('does not debit a failed payout, because nothing arrived', () => {
    assert.equal(reducesBalance('failed'), false)
  })
})

describe('selfApproved', () => {
  it('spots one person doing both halves', () => {
    // Allowed — a one-person desk could otherwise never pay anybody — but never silent.
    assert.equal(
      selfApproved({ requestedByMemberId: 'mem_1', approvedByMemberId: 'mem_1' }),
      true,
    )
  })

  it('is false when two different people were involved', () => {
    assert.equal(
      selfApproved({ requestedByMemberId: 'mem_1', approvedByMemberId: 'mem_2' }),
      false,
    )
  })

  it('is false before anybody has approved it', () => {
    assert.equal(
      selfApproved({ requestedByMemberId: 'mem_1', approvedByMemberId: null }),
      false,
    )
  })

  it('does not call two unknowns the same person', () => {
    // Two nulls are not a match. Entries written by the system have no member against
    // them, and reading that as self-approval would flag them all.
    assert.equal(selfApproved({ requestedByMemberId: null, approvedByMemberId: null }), false)
  })
})
