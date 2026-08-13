import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'gold' | 'up' | 'down' | 'muted'

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-panel-2 text-ink-dim',
  gold: 'border-gold/35 bg-gold/10 text-gold',
  up: 'border-up/35 bg-up/10 text-up',
  down: 'border-down/35 bg-down/10 text-down',
  muted: 'border-line bg-transparent text-ink-dim/70',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'font-mono text-[10px] uppercase tracking-[0.12em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'active':
    case 'sent':
    case 'delivered':
    case 'opened':
    case 'clicked':
      return 'up'
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'down'
    case 'pending':
    case 'queued':
      return 'gold'
    default:
      return 'neutral'
  }
}
