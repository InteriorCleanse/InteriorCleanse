export type ProductCategory =
  | 'candle'
  | 'print'
  | 'tote'
  | 'mug'
  | 'cleaning'
  | 'book'
  | 'custom'

export type Product = {
  slug: string
  name: string
  category: ProductCategory
  tagline: string
  description: string
  price: number
  heroImage: string
  gallery: string[]
  /** Base colour the 3D product stage uses when rendering this object. */
  materialColor?: string
  viewer: {
    mode: 'spin' | 'model' | 'static'
    spinImages?: string[]
    modelPath?: string
    frameCount?: number
  }
  channels: {
    website: boolean
    amazonUrl?: string
    etsyUrl?: string
    tiktokShopUrl?: string
    printfulId?: string
    printifyId?: string
  }
  featured: boolean
  comingSoon: boolean
  badge?: string
  /** Overrides the category-derived care notes on the product page. */
  careNotes?: string[]
}

export type BookTrack = 'mind' | 'health' | 'home'

export type Book = {
  slug: string
  title: string
  subtitle?: string
  /** Books without a track belong to the main (mind) library. */
  track?: BookTrack
  coverImage: string
  imageAlt: string
  hook: string
  bullets: string[]
  paperbackUrl: string
  kindleUrl: string
  featured: boolean
}

export type SpiritBook = {
  slug: string
  title: string
  subtitle: string
  category: string
  coverImage: string
  imageAlt: string
  description: string
  amazonUrl: string
  price: string
  badge?: string
}

export type Article = {
  slug: string
  title: string
  eyebrow: string
  excerpt: string
  date: string
  image: string
  imageAlt: string
  body: string[]
}
