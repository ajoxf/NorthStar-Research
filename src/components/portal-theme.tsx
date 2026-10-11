'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

import { ThemeToggle } from '@/components/theme-toggle'
import { type AdminTheme, isThemedPortalPath } from '@/lib/admin-theme'

/**
 * The portal's theme wrapper, decided in the browser from the current path.
 *
 * Client-side because the portal layout is kept alive between its pages: a wrapper the
 * server set for /affiliate would still be day after clicking through to the dashboard,
 * which stays night. The first paint is still right — the server renders this with the
 * path and the cookie it was asked for.
 */
const ChoiceContext = React.createContext<{ choice: AdminTheme; setChoice: (theme: AdminTheme) => void } | null>(null)

export function PortalTheme({ initial, children }: { initial: AdminTheme; children: React.ReactNode }) {
  const [choice, setChoice] = React.useState(initial)
  const themed = isThemedPortalPath(usePathname() ?? '')
  return (
    <ChoiceContext.Provider value={{ choice, setChoice }}>
      <div data-admin-theme={themed ? choice : 'dark'} className="bg-bg text-ink">
        {children}
      </div>
    </ChoiceContext.Provider>
  )
}

/** The day/night switch, shown only on the pages that take it. */
export function PortalThemeToggle() {
  const context = React.useContext(ChoiceContext)
  const themed = isThemedPortalPath(usePathname() ?? '')
  if (!context || !themed) return null
  return <ThemeToggle initial={context.choice} onChange={context.setChoice} />
}
