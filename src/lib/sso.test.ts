import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { refusalDestination, sessionRedirect, ssoRefusal } from './sso-shape'

const ok = { configured: true, signedIn: true, entitled: true, hasAccount: true }

describe('who may be handed a session for the product', () => {
  it('lets a subscribed member through', () => {
    assert.equal(ssoRefusal(ok), null)
  })

  it('refuses somebody who is signed in but does not subscribe', () => {
    // The requirement in one line: being signed into the portal is not access to RAMP.
    assert.equal(ssoRefusal({ ...ok, entitled: false }), 'not_entitled')
  })

  it('refuses somebody signed out, before anything else', () => {
    assert.equal(
      ssoRefusal({ configured: false, signedIn: false, entitled: false, hasAccount: false }),
      'signed_out',
    )
  })

  it('blames the deployment rather than the customer when the bridge is off', () => {
    // Telling a paying subscriber they are not entitled, when in fact nothing was
    // switched on, sends them to support over something they cannot fix.
    assert.equal(ssoRefusal({ ...ok, configured: false, entitled: false }), 'not_configured')
  })

  it('distinguishes entitled-but-not-yet-provisioned', () => {
    assert.equal(ssoRefusal({ ...ok, hasAccount: false }), 'no_account')
  })
})

describe('where a refusal lands', () => {
  it('sends a signed-out visitor to sign in and come back', () => {
    assert.equal(
      refusalDestination('signed_out', '/api/sso/ramp'),
      '/login?next=%2Fapi%2Fsso%2Framp',
    )
  })

  it('sends everyone else to the dashboard, which says what they do hold', () => {
    assert.equal(refusalDestination('not_entitled', '/x'), '/dashboard?sso=not_entitled')
    assert.equal(refusalDestination('no_account', '/x'), '/dashboard?sso=setting_up')
    assert.equal(refusalDestination('not_configured', '/x'), '/dashboard?sso=unavailable')
  })
})

describe('the return trip', () => {
  const session = { access_token: 'acc-123', refresh_token: 'ref-456' }

  it('carries the session in the fragment, never the query string', () => {
    const url = sessionRedirect('https://nexus-funds.vercel.app', session)
    assert.equal(url.includes('?'), false)
    const [base, fragment] = url.split('#')
    assert.equal(base, 'https://nexus-funds.vercel.app/')
    const parsed = new URLSearchParams(fragment)
    assert.equal(parsed.get('access_token'), 'acc-123')
    assert.equal(parsed.get('refresh_token'), 'ref-456')
    assert.equal(parsed.get('type'), 'magiclink')
  })

  it('normalises a URL however it was stored', () => {
    // The product URL comes from a database column an operator edits. A trailing slash,
    // or a leftover fragment from a paste, must not produce two fragments in one URL.
    for (const stored of [
      'https://nexus-funds.vercel.app/',
      'https://nexus-funds.vercel.app',
      'https://nexus-funds.vercel.app/#stale',
      'https://nexus-funds.vercel.app/?utm=x',
    ]) {
      const url = sessionRedirect(stored, session)
      assert.equal(url.split('#').length, 2, stored)
      assert.equal(url.startsWith('https://nexus-funds.vercel.app/#'), true, stored)
    }
  })
})
