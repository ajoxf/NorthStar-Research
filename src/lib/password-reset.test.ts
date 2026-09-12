import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RESET_WINDOW_MINUTES,
  canSetPasswordWithoutCurrent,
} from './password-reset-shape'

const now = new Date('2026-09-12T12:00:00Z')
const secondsAgo = (n: number) => Math.floor(now.getTime() / 1000) - n

describe('setting a password without knowing the old one', () => {
  it('is allowed when there is no old one to know', () => {
    // Signed in with Google and never set a password. Demanding the current one locked
    // these people out of ever having a password at all — the check was refusing the only
    // people it could not possibly protect.
    assert.equal(
      canSetPasswordWithoutCurrent({
        hasPassword: false,
        via: 'google',
        viaAt: secondsAgo(60 * 60 * 24 * 10),
        now,
      }),
      true,
    )
  })

  it('is allowed just after signing in through an email link', () => {
    // The link went to the address on the account and expires in fifteen minutes. That is
    // the same proof a reset email gives, and without accepting it this site has no
    // password reset whatsoever.
    assert.equal(
      canSetPasswordWithoutCurrent({ hasPassword: true, via: 'link', viaAt: secondsAgo(120), now }),
      true,
    )
  })

  it('closes half an hour after that link was used', () => {
    const justInside = secondsAgo(RESET_WINDOW_MINUTES * 60 - 30)
    const justOutside = secondsAgo(RESET_WINDOW_MINUTES * 60 + 30)
    assert.equal(
      canSetPasswordWithoutCurrent({ hasPassword: true, via: 'link', viaAt: justInside, now }),
      true,
    )
    // The session itself lasts thirty days. The right to take over the account does not:
    // a link session left open on a shared machine is an ordinary session by then.
    assert.equal(
      canSetPasswordWithoutCurrent({ hasPassword: true, via: 'link', viaAt: justOutside, now }),
      false,
    )
  })

  it('is never allowed on a password or Google session that has a password', () => {
    for (const via of ['password', 'google'] as const) {
      assert.equal(
        canSetPasswordWithoutCurrent({ hasPassword: true, via, viaAt: secondsAgo(10), now }),
        false,
      )
    }
  })

  it('treats a missing or future timestamp as closed, not as just now', () => {
    // A token from before these claims existed carries viaAt 0. Reading that as "now"
    // would hand a reset window to every session ever issued.
    assert.equal(
      canSetPasswordWithoutCurrent({ hasPassword: true, via: 'link', viaAt: 0, now }),
      false,
    )
    assert.equal(
      canSetPasswordWithoutCurrent({ hasPassword: true, via: 'link', viaAt: secondsAgo(-600), now }),
      false,
    )
  })
})
