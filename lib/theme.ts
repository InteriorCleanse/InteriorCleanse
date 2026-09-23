/**
 * The themes a viewer can choose, in one place.
 *
 * The switcher, the no-flash bootstrap script in the root layout, and the
 * contrast test all lean on these names. Arch is the default and the
 * signature; dark and light are the classic pair. The value is what goes on
 * `<html data-theme>` and into storage — bare `:root` is the light theme, so
 * "light" is represented explicitly here and written as an attribute rather
 * than by removing it, which keeps a deliberate light choice from being
 * re-read as "no preference, use the default".
 */

export const THEMES = [
  { value: 'arch', label: 'Arch' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
] as const

export type ThemeValue = (typeof THEMES)[number]['value']

export const DEFAULT_THEME: ThemeValue = 'arch'
export const THEME_STORAGE_KEY = 'aurelis-theme'

export function isTheme(value: unknown): value is ThemeValue {
  return typeof value === 'string' && THEMES.some((t) => t.value === value)
}

/** Any stored or attribute value, reduced to a real theme. */
export function normalizeTheme(value: unknown): ThemeValue {
  return isTheme(value) ? value : DEFAULT_THEME
}
