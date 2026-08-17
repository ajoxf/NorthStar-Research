import type { ReportType } from '@prisma/client'

/**
 * The four fixed report types. There are no others and none are configurable.
 *
 * Four *types*, three published in a typical week — the desk chooses which. The cadence
 * quoted on the marketing pages is therefore three, and it is not derived from this list.
 */
export const REPORT_TYPES: {
  value: ReportType
  label: string
  shortLabel: string
  blurb: string
  /** Default instrument tabs shown in the reader for this report type. */
  defaultInstruments: string[]
}[] = [
  {
    value: 'commodities',
    label: 'Report 1 — Commodities',
    shortLabel: 'Commodities',
    blurb: 'Energy, metals and agricultural markets read through trend structure and the macro backdrop.',
    defaultInstruments: ['XAUUSD', 'XAGUSD', 'WTI', 'NATGAS', 'COPPER'],
  },
  {
    value: 'international_markets',
    label: 'Report 2 — International Markets & Indices',
    shortLabel: 'International Markets & Indices',
    blurb: 'Global index structure, cross-market rotation and the macro drivers behind them.',
    defaultInstruments: ['DXY', 'SPX', 'DAX', 'NIKKEI', 'EURUSD'],
  },
  {
    value: 'options_crypto_spread',
    label: 'Report 3 — Option Strategies, Crypto & Spread Opportunities',
    shortLabel: 'Options, Crypto & Spreads',
    blurb: 'Defined-risk option structures, digital assets and relative-value spreads, framed as scenarios.',
    defaultInstruments: ['BTCUSD', 'ETHUSD', 'SPX', 'VIX', 'EURUSD'],
  },
  {
    value: 'fx_currencies',
    label: 'Report 4 — FX & Currencies',
    shortLabel: 'FX & Currencies',
    blurb:
      'Major and cross pairs with rate-differential context, carry positioning and the technical structure into the week.',
    defaultInstruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'EURGBP'],
  },
]

export function reportTypeMeta(type: ReportType) {
  return REPORT_TYPES.find((t) => t.value === type) ?? REPORT_TYPES[0]
}

export function reportTypeLabel(type: ReportType): string {
  return reportTypeMeta(type).shortLabel
}

/**
 * Structured content behind the tabbed instrument table in the reader
 * (build spec §16 / §6). Each tab is one instrument; each row is one data line.
 */
export type InstrumentRow = {
  label: string
  value: string
  /** Drives the up/down colouring in the table. */
  bias?: 'up' | 'down' | 'neutral'
  note?: string
}

export type ReportInstrument = {
  symbol: string
  name?: string
  last?: string
  change?: string
  bias?: 'up' | 'down' | 'neutral'
  rows: InstrumentRow[]
  commentary?: string
}

export function parseInstruments(raw: unknown): ReportInstrument[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<ReportInstrument>
    if (typeof candidate.symbol !== 'string' || candidate.symbol.trim() === '') return []
    return [
      {
        symbol: candidate.symbol,
        name: typeof candidate.name === 'string' ? candidate.name : undefined,
        last: typeof candidate.last === 'string' ? candidate.last : undefined,
        change: typeof candidate.change === 'string' ? candidate.change : undefined,
        bias: candidate.bias === 'up' || candidate.bias === 'down' ? candidate.bias : 'neutral',
        commentary: typeof candidate.commentary === 'string' ? candidate.commentary : undefined,
        rows: Array.isArray(candidate.rows)
          ? candidate.rows.flatMap((row) => {
              if (!row || typeof row !== 'object') return []
              const r = row as Partial<InstrumentRow>
              if (typeof r.label !== 'string') return []
              return [
                {
                  label: r.label,
                  value: typeof r.value === 'string' ? r.value : '—',
                  bias: r.bias === 'up' || r.bias === 'down' ? r.bias : 'neutral',
                  note: typeof r.note === 'string' ? r.note : undefined,
                },
              ]
            })
          : [],
      },
    ]
  })
}

/**
 * Sample rows used by the locked preview on the marketing page. These are
 * illustrative of the *format* only — they are never presented as live research,
 * and they are blurred behind the lock overlay for logged-out visitors.
 */
export const PREVIEW_INSTRUMENTS: ReportInstrument[] = [
  {
    symbol: 'DXY',
    name: 'US Dollar Index',
    last: '104.28',
    change: '+0.34%',
    bias: 'up',
    rows: [
      { label: 'Weekly bias', value: 'Constructive', bias: 'up' },
      { label: 'Primary resistance', value: '105.10 / 105.86' },
      { label: 'Primary support', value: '103.40 / 102.75' },
      { label: 'Invalidation', value: 'Weekly close below 102.75', bias: 'down' },
      { label: 'Positioning note', value: 'Net long, extended vs. 20d average' },
    ],
  },
  {
    symbol: 'XAUUSD',
    name: 'Gold',
    last: '2,341.60',
    change: '-0.61%',
    bias: 'down',
    rows: [
      { label: 'Weekly bias', value: 'Corrective', bias: 'down' },
      { label: 'Primary resistance', value: '2,372 / 2,401' },
      { label: 'Primary support', value: '2,318 / 2,286' },
      { label: 'Invalidation', value: 'Reclaim of 2,401 on volume', bias: 'up' },
      { label: 'Positioning note', value: 'Profit-taking into event risk' },
    ],
  },
  {
    symbol: 'XAGUSD',
    name: 'Silver',
    last: '27.94',
    change: '+1.12%',
    bias: 'up',
    rows: [
      { label: 'Weekly bias', value: 'Constructive', bias: 'up' },
      { label: 'Primary resistance', value: '28.60 / 29.40' },
      { label: 'Primary support', value: '27.10 / 26.35' },
      { label: 'Invalidation', value: 'Loss of 26.35', bias: 'down' },
      { label: 'Positioning note', value: 'Outperforming gold on the ratio' },
    ],
  },
  {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    last: '1.0842',
    change: '-0.18%',
    bias: 'down',
    rows: [
      { label: 'Weekly bias', value: 'Neutral to soft' },
      { label: 'Primary resistance', value: '1.0910 / 1.0975' },
      { label: 'Primary support', value: '1.0790 / 1.0725' },
      { label: 'Invalidation', value: 'Daily close above 1.0975', bias: 'up' },
      { label: 'Positioning note', value: 'Rate differential still adverse' },
    ],
  },
  {
    symbol: 'BTCUSD',
    name: 'Bitcoin',
    last: '61,480',
    change: '+2.44%',
    bias: 'up',
    rows: [
      { label: 'Weekly bias', value: 'Constructive', bias: 'up' },
      { label: 'Primary resistance', value: '64,200 / 67,900' },
      { label: 'Primary support', value: '58,600 / 55,200' },
      { label: 'Invalidation', value: 'Weekly close below 55,200', bias: 'down' },
      { label: 'Positioning note', value: 'Funding neutral, spot-led bid' },
    ],
  },
]
