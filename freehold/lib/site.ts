export const SITE = {
  name: 'Freehold',
  tagline: 'Software you own outright.',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://freeholdprivate.com').replace(/\/$/, ''),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@freeholdprivate.com',
  description:
    'Freehold builds software you own outright. Freehold Build generates apps into your own GitHub, database and Vercel on your own key. Freehold Private builds bespoke software for family offices and the people who run them.',
}

export const NAV = [
  { href: '/build/', label: 'Build' },
  { href: '/private/', label: 'Private' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
]
