import type { IconName } from './Icons'

export interface NavItem {
  label: string
  href: string
  icon: IconName
  key: string
}

export const NAV: NavItem[] = [
  { label: 'Search', href: '/', icon: 'search', key: 's' },
  { label: 'Favorites', href: '/favorites', icon: 'heart', key: 'f' },
  { label: 'Trips', href: '/trips', icon: 'trips', key: 't' },
  { label: 'Inbox', href: '/inbox', icon: 'chat', key: 'i' },
  { label: 'More', href: '/more', icon: 'list', key: 'm' },
  { label: 'Become a host', href: '/host', icon: 'key', key: 'h' },
  { label: 'Coverage', href: '/coverage', icon: 'shield', key: 'c' },
  { label: 'Profile', href: '/account', icon: 'user', key: 'a' },
  { label: 'Trust & safety', href: '/security', icon: 'lock', key: 'p' },
  { label: 'AVANT Circle', href: '/circle', icon: 'star', key: 'r' },
  { label: 'Why AVANT', href: '/why', icon: 'sparkle', key: 'w' },
]

/** The five tabs, in the order the app shows them. */
export const TABS = NAV.slice(0, 5)
