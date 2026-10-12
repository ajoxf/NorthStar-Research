import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Five stars with `rating` filled. Labelled for screen readers as "4 out of 5", because a
 * row of icons says nothing to someone who cannot see it.
 */
export function Stars({ rating, size = 14, className }: { rating: number; size?: number; className?: string }) {
  const filled = Math.round(rating)
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          style={{ width: size, height: size }}
          className={n <= filled ? 'fill-current text-[rgb(var(--star))]' : 'text-current opacity-30'}
        />
      ))}
    </span>
  )
}
