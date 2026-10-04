export const SITE = {
  name: 'Freehold',
  tagline: 'Software you own outright.',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://freeholdprivate.com').replace(/\/$/, ''),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@freeholdprivate.com',
  /** A Cal.com or Calendly link. When set, every "Request a call" goes straight to the calendar. */
  booking: process.env.NEXT_PUBLIC_BOOKING_URL || '',
  /** The review's fixed fee as the owner wants it shown, e.g. "$2,500". Hidden until set. */
  reviewFee: process.env.NEXT_PUBLIC_REVIEW_FEE || '',
  description:
    'Freehold builds software you own outright. Freehold Build generates apps into your own GitHub, database and Vercel on your own key. Freehold Private builds bespoke software for family offices and the people who run them.',
}

/** Where a call request goes: the owner's calendar if set, otherwise the form. */
export const CALL_HREF = process.env.NEXT_PUBLIC_BOOKING_URL || '/private/#call'

export const NAV = [
  { href: '/check/', label: 'Check' },
  { href: '/build/', label: 'Build' },
  { href: '/private/', label: 'Private' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
]
