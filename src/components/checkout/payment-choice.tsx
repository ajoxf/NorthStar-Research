'use client'

import * as React from 'react'

import { Label } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/** A way to pay, as /api/checkout/methods offers it. */
export type PaymentMethod = { id: string; label: string; recurring: boolean }

// Every ISO 3166-1 country, shown by name in the buyer's language order. A buyer abroad
// picks their own; the default is a guess from where they are browsing.
const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD ' +
  'CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE ' +
  'GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN ' +
  'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG ' +
  'SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI ' +
  'VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

function countryOptions(): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    names = null
  }
  return COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The country list, built in the browser only. Country names come from Intl, whose data
 * differs between the server's Node and the visitor's browser ("Turkey" or "Türkiye"), so
 * rendering them on both sides would not match.
 */
export function useCountryOptions(): { code: string; name: string }[] {
  const [options, setOptions] = React.useState<{ code: string; name: string }[]>([])
  React.useEffect(() => setOptions(countryOptions()), [])
  return options
}

/**
 * The ways this buyer may pay, for their billing country and the currency they are charged
 * in — asked of the server, which applies the admin's rules. `country` empty means "guess
 * from where I am"; the guess comes back as `detected` to fill the select.
 */
export function usePaymentMethods(currency: string | null, country: string) {
  const [methods, setMethods] = React.useState<PaymentMethod[] | null>(null)
  const [detected, setDetected] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!currency) return
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/checkout/methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, country: country || undefined }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { country: string | null; methods: PaymentMethod[] } | null) => {
        if (!data) return
        setMethods(data.methods)
        setDetected(data.country)
      })
      .catch(() => {
        // Aborted by a newer request, or offline: keep what is on screen.
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [currency, country])

  return { methods, detected, loading }
}

/** Where most buyers are, listed first. */
const COMMON = ['AE', 'SA', 'GB', 'US', 'IN', 'DE', 'FR', 'SG', 'AU', 'CA', 'EG', 'KW', 'QA', 'BH', 'OM']

/**
 * The options of a billing-country select: the common countries first, then all of them
 * A–Z. Built in the browser only (see useCountryOptions).
 */
export function CountryOptionList({ placeholder = 'Choose your country' }: { placeholder?: string }) {
  const options = useCountryOptions()
  const byCode = new Map(options.map((option) => [option.code, option.name]))
  return (
    <>
      <option value="">{placeholder}</option>
      {options.length > 0 && (
        <>
          <optgroup label="Most common">
            {COMMON.filter((code) => byCode.has(code)).map((code) => (
              <option key={`c-${code}`} value={code}>
                {byCode.get(code)}
              </option>
            ))}
          </optgroup>
          <optgroup label="All countries">
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </optgroup>
        </>
      )}
    </>
  )
}

/** Billing country. Shown once per page; every payment choice below follows it. */
export function CountrySelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: string
  onChange: (code: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>Billing country</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-[16px] text-ink"
      >
        <CountryOptionList />
      </select>
    </div>
  )
}

/**
 * The providers on offer, as radio buttons. The first is chosen until the buyer picks
 * another. Says plainly when there is nothing — the buyer cannot check out, and should not
 * be left wondering why the button does nothing.
 */
export function MethodChoice({
  name,
  methods,
  value,
  onChange,
  per,
}: {
  name: string
  methods: PaymentMethod[] | null
  value: string | null
  onChange: (id: string) => void
  /** "month" or "year", for the renewal note. */
  per?: string
}) {
  if (methods === null) return <p className="text-[15px] text-ink-dim">Finding the ways you can pay…</p>
  if (methods.length === 0) {
    return (
      <p className="rounded-lg border border-line px-4 py-3 text-[15px] leading-relaxed text-ink-dim">
        Online payment isn&rsquo;t available for this country yet. Please{' '}
        <a href="/faqs" className="text-ink underline underline-offset-4">
          contact us
        </a>{' '}
        and we will arrange it.
      </p>
    )
  }
  return (
    <div role="radiogroup" aria-label="How to pay" className="flex flex-col gap-2">
      {methods.map((method) => {
        const selected = value === method.id
        return (
          <label
            key={method.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
              selected ? 'border-accent bg-accent/5' : 'border-line hover:border-ink/40',
            )}
          >
            <input
              type="radio"
              name={name}
              value={method.id}
              checked={selected}
              onChange={() => onChange(method.id)}
              className="mt-1 accent-[rgb(var(--accent))]"
            />
            <span>
              <span className="block text-[16px] text-ink">{method.label}</span>
              <span className="block text-[13px] text-ink-dim">
                {method.recurring
                  ? `Renews every ${per ?? 'period'} until you cancel.`
                  : `Pays for one ${per ?? 'period'}; we remind you before it ends.`}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Keep a selection valid as the list changes: the first on offer unless the buyer chose one still offered. */
export function useChosenMethod(methods: PaymentMethod[] | null) {
  const [chosen, setChosen] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!methods || methods.length === 0) {
      setChosen(null)
      return
    }
    setChosen((current) => (current && methods.some((method) => method.id === current) ? current : methods[0].id))
  }, [methods])
  return [chosen, setChosen] as const
}
