// Planned catalog for GCode Keys. Prices here are EXAMPLE values for the
// preview build; set real prices before launch (see README). Nothing here is
// a live charge.

export type Product = {
  id: string
  category: string
  name: string
  blurb: string
  priceExample: number
  tag?: string
}

export const PRODUCTS: Product[] = [
  { id: 'shell', category: 'FOB SHELL', name: 'Custom shell', blurb: 'Your color and finish, the same electronics inside.', priceExample: 29 },
  { id: 'cover', category: 'COVER', name: 'Leather fob cover', blurb: 'Full-grain leather, molded to your fob.', priceExample: 24 },
  { id: 'faraday', category: 'DEFENSE', name: 'Faraday key pouch', blurb: 'Blocks relay theft in the driveway.', priceExample: 19, tag: 'HOT' },
  { id: 'engrave', category: 'ENGRAVE', name: 'Engraved key head', blurb: 'Laser-etched name, initials, or fleet ID.', priceExample: 15 },
  { id: 'spares', category: 'SPARES', name: 'Spare 2-pack', blurb: 'Two keys, cut and coded in one session.', priceExample: 199 },
  { id: 'remote', category: 'REMOTE', name: 'Universal remote', blurb: 'Covers hundreds of models.', priceExample: 59 },
]

// Fob configurator options.
export const SHELL_COLORS = [
  { name: 'Neon green', hex: '#15e37a' },
  { name: 'Noir black', hex: '#141414' },
  { name: 'Hot pink', hex: '#ff2e88' },
  { name: 'Cyber blue', hex: '#3da5ff' },
  { name: 'Amber', hex: '#ffcf4d' },
  { name: 'Silver', hex: '#e6e6e6' },
]

export const FINISHES = [
  { id: 'gloss', label: 'Gloss', premium: 0 },
  { id: 'matte', label: 'Matte', premium: 0 },
  { id: 'carbon', label: 'Carbon', premium: 15 },
  { id: 'chrome', label: 'Chrome', premium: 15 },
] as const

export const KEY_TYPES = [
  { id: 'shell', label: 'Shell only', base: 39 },
  { id: 'remote', label: 'Remote', base: 129 },
  { id: 'smart', label: 'Smart key', base: 219 },
] as const

// Illustrative limited drops.
export const DROPS = [
  { id: 'd1', name: 'Matrix Carbon', units: 100, minutes: 2880 },
  { id: 'd2', name: 'Noir / Gold', units: 50, minutes: 7200 },
  { id: 'd3', name: 'Vapor Chrome', units: 25, minutes: 13200 },
]
