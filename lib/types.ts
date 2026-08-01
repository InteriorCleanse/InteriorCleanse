export type ProductCategory = 'candle' | 'print' | 'tote' | 'mug' | 'cleaning' | 'book' | 'custom'

export type Product = {
  slug: string
  name: string
  category: ProductCategory
  tagline: string
  description: string
  price: number
  heroImage: string
  gallery: string[]
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
}

export type Book = { slug:string; title:string; subtitle?:string; coverImage:string; imageAlt:string; hook:string; bullets:string[]; paperbackUrl:string; kindleUrl:string; featured:boolean }
export type Article = { slug:string; title:string; eyebrow:string; excerpt:string; date:string; image:string; imageAlt:string; body:string[] }
