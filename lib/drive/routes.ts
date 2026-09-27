/**
 * Every Drive URL, built here and nowhere else, so a route can move without
 * a search-and-replace. `trailingSlash: true` is set for the whole site, so
 * every path ends in a slash.
 */

export const DRIVE = {
  home: '/drive/',
  cars: '/drive/cars/',
  car: (slug: string) => `/drive/cars/${slug}/`,
  book: (slug: string) => `/drive/book/${slug}/`,
  trips: '/drive/trips/',
  trip: (id: string) => `/drive/trips/${id}/`,
  saved: '/drive/saved/',
  host: '/drive/host/',
  hostNew: '/drive/host/new/',
  hostListings: '/drive/host/listings/',
  inbox: '/drive/inbox/',
  thread: (id: string) => `/drive/inbox/?thread=${id}`,
  account: '/drive/account/',
  help: '/drive/help/',
} as const

export type NavIcon = 'compass' | 'trips' | 'heart' | 'key' | 'inbox' | 'user' | 'help'

export interface NavItem {
  label: string
  href: string
  icon: NavIcon
  /** The `g` + key chord that jumps here from anywhere. */
  key: string
  /** True when the item should highlight for every route beneath it. */
  section: boolean
}

/** The five destinations on the mobile tab bar and the desktop top bar. */
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Explore', href: DRIVE.cars, icon: 'compass', key: 'e', section: true },
  { label: 'Trips', href: DRIVE.trips, icon: 'trips', key: 't', section: true },
  { label: 'Saved', href: DRIVE.saved, icon: 'heart', key: 's', section: true },
  { label: 'Host', href: DRIVE.host, icon: 'key', key: 'h', section: true },
  { label: 'Inbox', href: DRIVE.inbox, icon: 'inbox', key: 'i', section: true },
]

export const SECONDARY_NAV: NavItem[] = [
  { label: 'Account', href: DRIVE.account, icon: 'user', key: 'a', section: true },
  { label: 'Help', href: DRIVE.help, icon: 'help', key: '?', section: true },
]

export function isDrivePath(pathname: string | null): boolean {
  return Boolean(pathname && (pathname === '/drive' || pathname.startsWith('/drive/')))
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === DRIVE.cars) return pathname.startsWith('/drive/cars')
  return item.section ? pathname.startsWith(item.href.replace(/\/$/, '')) : pathname === item.href
}
