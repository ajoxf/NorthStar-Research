'use client'

import Link from 'next/link'
import { Check, ShoppingBag } from 'lucide-react'

import { useCart, type CartItem } from '@/components/cart/cart-store'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** The header's cart link. Hidden while the cart is empty, so it never advertises nothing. */
export function CartLink() {
  const { items } = useCart()
  if (items.length === 0) return null
  return (
    <Link
      href="/cart"
      aria-label={`Cart, ${items.length} item${items.length === 1 ? '' : 's'}`}
      className="relative flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink-dim transition-colors hover:text-ink"
    >
      <ShoppingBag aria-hidden className="h-4 w-4" />
      <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-[18px] text-on-accent">
        {items.length}
      </span>
    </Link>
  )
}

/**
 * Add one section or package to the cart. Once added it says so and links to the cart,
 * rather than offering to add the same thing twice.
 */
export function AddToCartButton({
  item,
  tone = 'dark',
  className,
}: {
  item: CartItem
  tone?: 'dark' | 'light'
  className?: string
}) {
  const cart = useCart()
  const toast = useToast()
  const inCart = cart.has(item)

  if (inCart) {
    return (
      <Link
        href="/cart"
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium',
          tone === 'light' ? 'text-ink-on-light' : 'text-ink',
          className,
        )}
      >
        <Check aria-hidden className="h-4 w-4" />
        In your cart
      </Link>
    )
  }

  return (
    <Button
      type="button"
      variant={tone === 'light' ? 'on-light' : 'secondary'}
      className={className}
      onClick={() => {
        if (cart.add(item)) toast(`${item.name} added to your cart`)
        else toast('Your cart is full. Check out what is in it first.', 'error')
      }}
    >
      <ShoppingBag aria-hidden className="h-4 w-4" />
      Add to cart
    </Button>
  )
}
