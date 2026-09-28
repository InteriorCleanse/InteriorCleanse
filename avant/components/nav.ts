import type { IconName } from './Icons'

export interface NavItem {
  label: string
  href: string
  icon: IconName
  key: string
}

export const NAV: NavItem[] = [
  { label: 'Search', href: '/search', icon: 'compass', key: 's' },
  { label: 'Coverage', href: '/coverage', icon: 'shield', key: 'c' },
  { label: 'Trips', href: '/trips', icon: 'trips', key: 't' },
  { label: 'Host', href: '/host', icon: 'key', key: 'h' },
  { label: 'Saved', href: '/saved', icon: 'heart', key: 'v' },
  { label: 'Account', href: '/account', icon: 'user', key: 'a' },
  { label: 'Trust & safety', href: '/security', icon: 'lock', key: 'p' },
]

export const TOP_NAV = NAV.slice(0, 4)
