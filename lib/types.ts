export type ProductCategory =
  | 'candle'
  | 'print'
  | 'tote'
  | 'mug'
  | 'cleaning'
  | 'book'
  | 'custom'

/**
 * How a product is presented dimensionally.
 *
 * `depth_interactive` is the floor — every product gets at least this — and it
 * is deliberately honest about being a fallback rather than real geometry.
 */
export type RenderMode = 'true_3d' | 'spin_360' | 'depth_interactive'

/** Where the product comes from. Drives sync behaviour and admin grouping. */
export type SourceType =
  | 'owned'
  | 'printful'
  | 'printify'
  | 'amazon'
  | 'tiktok'
  | 'digital'

/**
 * Where the money changes hands. The UI reads this to decide whether an item
 * may enter the internal cart at all — external items never can.
 */
export type CheckoutMode =
  | 'internal_physical'
  | 'internal_digital'
  | 'external_amazon'
  | 'external_tiktok'
  | 'inquiry_or_consultation'

/** A parallax plane in a Mode C composition. */
export type DepthLayer = {
  src: string
  /** 0 = background (holds still), 1 = foreground (travels furthest). */
  depth: number
  alt?: string
}

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

  /**
   * Dimensional presentation. Omitted means `depth_interactive` — no product
   * is ever flat, and upgrading one is a content edit, not a deploy.
   */
  renderMode?: RenderMode
  /** Mode A. An optimized .glb/.gltf. */
  modelUrl?: string
  /** Painted before any heavy renderer boots; also the no-WebGL fallback. */
  posterUrl?: string
  /** Mode B. Ordered turntable frames. */
  spinFrames?: string[]
  /** Mode C. Omit and `heroImage` is used as a single layer. */
  depthLayers?: DepthLayer[]

  /** Commerce provenance. Omitted means `owned` + `internal_physical`. */
  sourceType?: SourceType
  checkoutMode?: CheckoutMode
  /** Required when `checkoutMode` is one of the `external_` variants. */
  externalPurchaseUrl?: string

  /** @deprecated Superseded by `renderMode`; kept for the existing viewer. */
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
    /**
     * Stripe Price ID (`price_…`), written by `npm run stripe:setup`.
     * `null` means the product has not been created in Stripe yet, and
     * checkout will refuse to sell it rather than guess a price.
     */
    stripePriceId?: string | null
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

export type DigitalProduct = {
  slug: string
  title: string
  subtitle: string
  format: string
  /** Display price, e.g. "$12" or "Free" — Gumroad is the source of truth. */
  price: string
  /** Product path on Gumroad; combined with the store in `gumroadUrl()`. */
  gumroadPath: string
  coverImage: string
  imageAlt: string
  description: string
  bullets: string[]
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
