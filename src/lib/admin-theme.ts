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
 * Admin only, by decision. The marketing site's alternating grounds are a design, and a
 * toggle across it would be a redesign rather than a setting.
 */
export const ADMIN_THEME_COOKIE = 'nsp_admin_theme'

export const ADMIN_THEMES = ['system', 'light', 'dark'] as const
export type AdminTheme = (typeof ADMIN_THEMES)[number]

export function parseAdminTheme(value: string | undefined | null): AdminTheme {
  return ADMIN_THEMES.find((theme) => theme === value) ?? 'system'
}
