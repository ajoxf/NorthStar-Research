import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RESEARCH_TRIAL_SLUG,
  researchTrialRefusal,
  researchTrialRefusalMessage,
} from '@/lib/research-trial'

const eligible = {
  enabled: true,
  subscriptionStatus: 'pending',
  researchTrialStartedAt: null as Date | null,
}

describe('who may have a free trial of the research membership', () => {
  it('somebody with no membership and no trial behind them', () => {
    assert.equal(researchTrialRefusal(eligible), null)
  })

  it('nobody, when the offer is closed', () => {
    assert.equal(researchTrialRefusal({ ...eligible, enabled: false }), 'disabled')
  })

  /*
   * The one that costs money if it is wrong. Judged on the marker, not on the status:
   * a trial that ended leaves the status at `expired`, and reading only the status would
   * hand the same account a fresh fortnight every month for as long as it was patient.
   */
  it('not twice — an expired trial still counts', () => {
    assert.equal(
      researchTrialRefusal({
        ...eligible,
        subscriptionStatus: 'expired',
        researchTrialStartedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      'already_a_member',
    )
    // And with the status somehow back at pending, the marker alone still refuses.
    assert.equal(
      researchTrialRefusal({ ...eligible, researchTrialStartedAt: new Date('2026-01-01T00:00:00Z') }),
      'already_trialled',
    )
  })

  it('not a current member — they are already paying for this', () => {
    assert.equal(
      researchTrialRefusal({ ...eligible, subscriptionStatus: 'active' }),
      'already_a_member',
    )
  })

  it('not somebody whose membership lapsed — that is a discount, not a trial', () => {
    for (const status of ['expired', 'cancelled']) {
      assert.equal(
        researchTrialRefusal({ ...eligible, subscriptionStatus: status }),
        'already_a_member',
      )
    }
  })

  it('not somebody already on a trial', () => {
    assert.equal(
      researchTrialRefusal({ ...eligible, subscriptionStatus: 'trialing' }),
      'already_a_member',
    )
  })

  /*
   * A product trialist leaves the subscription columns alone by design, so they sit at
   * `pending` and are still owed a look at the research. Refusing them here would mean
   * trying the software used up an offer for something else entirely.
   */
  it('yes to somebody who has only ever trialled a product', () => {
    assert.equal(researchTrialRefusal(eligible), null)
  })

  it('the offer is closed before anything else is considered', () => {
    assert.equal(
      researchTrialRefusal({
        enabled: false,
        subscriptionStatus: 'active',
        researchTrialStartedAt: new Date(),
      }),
      'disabled',
    )
  })
})

describe('what a refusal says out loud', () => {
  it('never names the machinery', () => {
    for (const refusal of ['disabled', 'already_trialled', 'already_a_member'] as const) {
      const message = researchTrialRefusalMessage(refusal)
      assert.ok(message.length > 0)
      assert.ok(!/entitlement|subscriptionStatus|null|item/i.test(message), message)
    }
  })
})

describe('the reserved handle', () => {
  /*
   * It travels through the same ?item= parameter as a real slug, so it must be shaped like
   * one — and it must not be a slug anybody would plausibly give a real item.
   */
  it('looks like an ordinary slug', () => {
    assert.match(RESEARCH_TRIAL_SLUG, /^[a-z0-9-]+$/)
  })
})
