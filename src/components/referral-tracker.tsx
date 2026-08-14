'use client'

import * as React from 'react'

import { REFERRAL_COOKIE } from '@/lib/affiliates'

/**
 * Records one click per visitor per affiliate link.
 *
 * Runs on the client because the middleware that sets the cookie runs on the edge, where
 * there is no database. This is the cheapest correct split: the edge decides *who* the
 * visitor is attributed to, and one fire-and-forget call records that they arrived.
 *
 * Guarded by session storage so a visitor reloading the page or wandering between routes
 * does not inflate a partner's click count — the number has to mean something for the
 * funnel beside it to mean anything.
 *
 * Everything here is best-effort. A failed call loses a tally, never a page.
 */
export function ReferralTracker() {
  React.useEffect(() => {
    const slug = readCookie(REFERRAL_COOKIE)
    if (!slug) return

    const key = `nsr:ref-seen:${slug}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {
      // Storage blocked (private mode). Recording a duplicate click beats recording none.
    }

    void fetch('/api/referral/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {})
  }, [])

  return null
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
