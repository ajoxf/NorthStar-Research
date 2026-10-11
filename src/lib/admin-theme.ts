/**
 * The admin console's light/dark choice.
 *
 * Kept in a cookie rather than localStorage so the server can put it on the console's
 * wrapper in the first paint. Read on the client instead, the page would render dark and
 * then flip — on every navigation, for every admin who chose light.
 *
 * `system` is the default and is a real value, not an absence: it hands the decision to
 * the device's own preference through a media query in globals.css, so somebody whose
 * laptop goes dark at sunset gets a console that follows it.
 *
 * Where it applies, by decision: the admin console, and the affiliate and expert pages of
 * the portal. One cookie for all of them, so a choice made on one holds on the others. The
 * public site and the member pages (dashboard, reports, archive, tools, account) stay
 * night: the public site's alternating grounds are a design, and a toggle across it would
 * be a redesign rather than a setting.
 */
export const ADMIN_THEME_COOKIE = 'nsp_admin_theme'

export const ADMIN_THEMES = ['system', 'light', 'dark'] as const
export type AdminTheme = (typeof ADMIN_THEMES)[number]

export function parseAdminTheme(value: string | undefined | null): AdminTheme {
  return ADMIN_THEMES.find((theme) => theme === value) ?? 'system'
}

/**
 * The portal's theme. Without a choice it stays night — the look every member already has —
 * rather than following the device, so nobody's dashboard changes under them unasked.
 */
export function parsePortalTheme(value: string | undefined | null): AdminTheme {
  return ADMIN_THEMES.find((theme) => theme === value) ?? 'dark'
}

/** The portal pages that take the theme: the affiliate's and the expert's own pages. */
export function isThemedPortalPath(pathname: string): boolean {
  return /^\/(affiliate|expert)(\/|$)/.test(pathname)
}
