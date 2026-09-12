import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isAlreadyRegistered,
  isConfigured,
  normaliseEmail,
  syncAction,
  type LinkedAccount,
} from './product-auth-shape'

const live: LinkedAccount = { externalId: 'u1', disabledAt: null }
const disabled: LinkedAccount = { externalId: 'u1', disabledAt: new Date('2026-09-01') }

describe('what to do about the product account', () => {
  it('creates one the first time somebody is granted the product', () => {
    assert.equal(syncAction({ holdsItem: true, account: null, password: 'chosen' }), 'create')
  })

  it('says so rather than creating an account nobody can sign into', () => {
    // An admin granting access by hand has no password to hand over. Better to report
    // that than to create an account with a secret nobody knows.
    assert.equal(syncAction({ holdsItem: true, account: null, password: null }), 'needs_password')
  })

  it('turns a lapsed account back on instead of making a second one', () => {
    assert.equal(syncAction({ holdsItem: true, account: disabled, password: null }), 'reactivate')
    assert.equal(syncAction({ holdsItem: true, account: disabled, password: 'new' }), 'reactivate')
  })

  it('passes a password change through to the product', () => {
    assert.equal(syncAction({ holdsItem: true, account: live, password: 'new' }), 'set_password')
  })

  it('does nothing when nothing has changed', () => {
    assert.equal(syncAction({ holdsItem: true, account: live, password: null }), 'none')
  })

  it('disables — never deletes — when access ends', () => {
    // Deleting would take their fills with it, and a trialist who subscribes a month
    // later would come back to an empty book.
    assert.equal(syncAction({ holdsItem: false, account: live, password: null }), 'disable')
  })

  it('leaves an already-disabled account alone', () => {
    assert.equal(syncAction({ holdsItem: false, account: disabled, password: null }), 'none')
    assert.equal(syncAction({ holdsItem: false, account: null, password: null }), 'none')
  })

  it('a password change by somebody who does not hold the product changes nothing there', () => {
    assert.equal(syncAction({ holdsItem: false, account: null, password: 'new' }), 'none')
  })
})

describe('configuration', () => {
  it('needs both halves', () => {
    assert.equal(isConfigured('https://x.supabase.co', 'service-key'), true)
    assert.equal(isConfigured('https://x.supabase.co', undefined), false)
    assert.equal(isConfigured(undefined, 'service-key'), false)
    assert.equal(isConfigured('', ''), false)
    assert.equal(isConfigured('  ', ' '), false)
  })

  it('a placeholder is not configuration', () => {
    // The repo ships REPLACE_ME values. Treating one as a real key would turn "not set
    // up yet" into an authentication failure on every signup.
    assert.equal(isConfigured('https://x.supabase.co', 'REPLACE_ME_SERVICE_KEY'), false)
  })
})

describe('recognising an account that already exists', () => {
  it('reads the shapes the auth API actually returns', () => {
    assert.equal(isAlreadyRegistered(422, { msg: 'User already registered' }), true)
    assert.equal(isAlreadyRegistered(422, { error_code: 'email_exists' }), true)
    assert.equal(isAlreadyRegistered(400, 'A user with this email address has already been registered'), true)
  })

  it('does not mistake other failures for it', () => {
    assert.equal(isAlreadyRegistered(401, { msg: 'Invalid API key' }), false)
    assert.equal(isAlreadyRegistered(500, { msg: 'Internal error' }), false)
    assert.equal(isAlreadyRegistered(422, { msg: 'Password should be at least 6 characters' }), false)
  })
})

describe('email spelling', () => {
  it('is normalised once, so two spellings never become two accounts', () => {
    assert.equal(normaliseEmail('  Sam@Firm.COM '), 'sam@firm.com')
  })
})

describe('an account that was already theirs', () => {
  const adopted: LinkedAccount = {
    externalId: 'u2',
    disabledAt: null,
    adoptedAt: new Date('2026-09-01'),
  }

  it('never has its password rewritten from here', () => {
    // Otherwise anyone who knows an email address could take over that product account
    // by starting a trial on it. An email is not proof of owning the account.
    assert.equal(syncAction({ holdsItem: true, account: adopted, password: 'new' }), 'none')
  })

  it('is still closed when access ends, and reopened when it comes back', () => {
    assert.equal(syncAction({ holdsItem: false, account: adopted, password: null }), 'disable')
    assert.equal(
      syncAction({
        holdsItem: true,
        account: { ...adopted, disabledAt: new Date('2026-09-05') },
        password: null,
      }),
      'reactivate',
    )
  })
})

describe('the bridge only applies to what has a sign-in elsewhere', () => {
  it('is decided by the item, not by the caller', () => {
    // A section is read on this site and has no account to create anywhere. The guard for
    // that lives in product-auth.ts, which needs the database; what is worth pinning here
    // is that the decision below never looks at who called it — only at what is held.
    assert.equal(syncAction({ holdsItem: false, account: null, password: 'chosen' }), 'none')
  })
})
