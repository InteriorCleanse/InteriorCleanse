/**
 * Meta descriptions that search engines show whole.
 *
 * Google truncates around 155–160 characters and drops descriptions under
 * roughly 70 as too thin to use. Product pages were shipping the tagline
 * ("Carry the edit.") as the description; this builds one from the copy that
 * already exists and cuts it at a word boundary.
 */
export const DESCRIPTION_MAX = 155

export function clampDescription(...parts: Array<string | null | undefined>): string {
  const text = parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .join(' ')
  if (text.length <= DESCRIPTION_MAX) return text
  const cut = text.slice(0, DESCRIPTION_MAX)
  const atWord = cut.lastIndexOf(' ')
  return (atWord > 90 ? cut.slice(0, atWord) : cut).replace(/[,;:\s—-]+$/, '') + '…'
}
