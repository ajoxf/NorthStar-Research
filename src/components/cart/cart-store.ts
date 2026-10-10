'use client'

import * as React from 'react'

/**
 * The cart, held in the visitor's browser.
 *
 * Only references and a display name live here — never a price. Every figure on the cart
 * page comes from /api/cart/quote, and checkout re-prices on the server, so a cart left in
 * a browser for a month can never charge last month's price.
 *
 * Browser storage can be unavailable (a private window, blocked site data); every access is
 * guarded, and the cart then simply lasts as long as the page.
 */
export type CartItem = { kind: 'section' | 'package'; id: string; name: string }

const KEY = 'nsp_cart'
/** The items handed to a checkout, removed from the cart once that payment succeeds. */
const PENDING_KEY = 'nsp_cart_pending'
const MAX = 20

let memory: CartItem[] = []
const listeners = new Set<() => void>()

function read(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is CartItem =>
            Boolean(item) && (item.kind === 'section' || item.kind === 'package') && typeof item.id === 'string',
        )
      : []
  } catch {
    return memory
  }
}

function write(items: CartItem[]) {
  memory = items
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Storage unavailable: the in-memory copy still serves this page.
  }
  cached = null
  listeners.forEach((listener) => listener())
}

let cached: CartItem[] | null = null
function snapshot(): CartItem[] {
  if (cached === null) cached = read()
  return cached
}
const EMPTY: CartItem[] = []

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changed the cart.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cached = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export const sameItem = (a: Pick<CartItem, 'kind' | 'id'>, b: Pick<CartItem, 'kind' | 'id'>) =>
  a.kind === b.kind && a.id === b.id

export function useCart() {
  const items = React.useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  return {
    items,
    has: (ref: Pick<CartItem, 'kind' | 'id'>) => items.some((item) => sameItem(item, ref)),
    add: (item: CartItem) => {
      const current = snapshot()
      if (current.some((existing) => sameItem(existing, item)) || current.length >= MAX) return false
      write([...current, item])
      return true
    },
    remove: (ref: Pick<CartItem, 'kind' | 'id'>) => write(snapshot().filter((item) => !sameItem(item, ref))),
  }
}

/** Remember which items a checkout is paying for, so success can take them out of the cart. */
export function markPending(refs: Pick<CartItem, 'kind' | 'id'>[]) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(refs))
  } catch {
    // Without storage the items stay in the cart, which is the safe way to be wrong.
  }
}

/** Called on the success page: drop what was just paid for, keep anything else. */
export function clearPaid() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY)
    if (!raw) return
    const paid = JSON.parse(raw) as Pick<CartItem, 'kind' | 'id'>[]
    write(snapshot().filter((item) => !paid.some((ref) => sameItem(item, ref))))
    window.sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing to clear.
  }
}
