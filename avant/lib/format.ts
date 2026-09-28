/** Formatting helpers shared by every Drive screen. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

/** Whole dollars for rates and headlines: 1234500 → "$12,345". */
export function money(cents: number): string {
  return usd.format(Math.round(cents / 100))
}

/** Exact amounts for receipts: 123450 → "$1,234.50". */
export function moneyExact(cents: number): string {
  return usdCents.format(cents / 100)
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function rating(value: number): string {
  return value.toFixed(1)
}

const KM_PER_MILE = 1.609344

export function distance(miles: number, units: 'mi' | 'km'): string {
  return units === 'km' ? `${Math.round(miles * KM_PER_MILE)} km` : `${miles} mi`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** A short, URL-safe id: not cryptographic, just unique enough for one device. */
export function shortId(prefix: string): string {
  const time = Date.now().toString(36)
  const noise = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${time}${noise}`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
