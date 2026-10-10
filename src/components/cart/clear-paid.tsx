'use client'

import * as React from 'react'

import { clearPaid } from '@/components/cart/cart-store'

/**
 * Takes what was just paid for out of the cart, on the page the payment returns to.
 *
 * Only those items: a cart with a monthly and a yearly group is two checkouts, and paying
 * for one must leave the other waiting.
 */
export function ClearPaidCart() {
  React.useEffect(() => clearPaid(), [])
  return null
}
