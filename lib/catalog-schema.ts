import type { ProductCategory, RenderMode } from './types'

/**
 * The catalog schema — one record per sellable thing, whatever sells it.
 *
 * This is the shape the admin edits, the sync routes write, and the storefront
 * reads (through `toLegacyProduct`, so nothing built against the older
 * `Product` type has to change). Every field that can be unknown is nullable
 * rather than defaulted: a `price` of 0 is not a price, a missing image is not
 * a placeholder, and a status of `draft` says so.
 */

export type CatalogStatus = 'draft' | 'needs-assets' | 'needs-pricing' | 'approved' | 'published'

export const CATALOG_STATUSES: CatalogStatus[] = [
  'draft',
  'needs-assets',
  'needs-pricing',
  'approved',
  'published',
]

/** Where the money changes hands. Decides which CTA a product can honestly show. */
export type PurchaseType = 'stripe' | 'affiliate' | 'gumroad' | 'amazon'

/** Who makes and ships it. */
export type Fulfillment = 'printful' | 'printify' | 'digital' | 'affiliate' | 'manual'

export type SizeClass = 'small' | 'medium' | 'large' | 'oversized'

/**
 * Merchandising category — the showroom's shelves and the `?category=` deep
 * links. Distinct from `objectType`, which is what the 3D presentation keys on:
 * a candle is `fragrance` on the shelf and `candle` on the stage.
 */
export type CatalogCategory =
  | 'books'
  | 'digital'
  | 'merch'
  | 'cleaning'
  | 'wellness'
  | 'home'
  | 'fragrance'
  | 'wall-art'
  | 'partners'

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  'books',
  'digital',
  'merch',
  'cleaning',
  'wellness',
  'home',
  'fragrance',
  'wall-art',
  'partners',
]

/** Environments a product can stand in. Mirrors the keys of content/scenes.json. */
export type CatalogEnvironment =
  | 'atrium'
  | 'library'
  | 'conservatory'
  | 'cleaning'
  | 'chapel'
  | 'gallery'
  | 'atelier'
  | 'pavilion'
  | 'showroom'

export const CATALOG_ENVIRONMENTS: CatalogEnvironment[] = [
  'atrium',
  'library',
  'conservatory',
  'cleaning',
  'chapel',
  'gallery',
  'atelier',
  'pavilion',
  'showroom',
]

export type CatalogImages = {
  /** The main catalogue photograph. */
  hero: string | null
  /** Alpha cut-out for the pedestal. Produced by /api/admin/remove-bg. */
  transparent: string | null
  gallery: string[]
}

export type CatalogProduct = {
  id: string
  slug: string
  name: string
  category: CatalogCategory
  environment: CatalogEnvironment
  description: string
  price: number
  currency: 'USD'
  compareAtPrice: number | null
  images: CatalogImages
  /** Ordered turntable frames; null until a sequence has been shot. */
  rotationSequence: string[] | null
  modelUrl: string | null
  sizeClass: SizeClass
  purchaseType: PurchaseType
  stripePriceId: string | null
  affiliateUrl: string | null
  gumroadUrl: string | null
  amazonUrl: string | null
  fulfillment: Fulfillment
  printfulVariantId: string | null
  printifyVariantId: string | null
  status: CatalogStatus
  featured: boolean
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  /** ISO date the owner last checked price, link, and availability. */
  lastVerified: string | null

  /* ── Presentation, carried through to the existing storefront ── */

  /** What the 3D/depth presentation treats this as. */
  objectType: ProductCategory
  tagline: string
  badge: string | null
  careNotes: string[] | null
  materialColor: string | null
  renderMode: RenderMode | null

  /* ── Provenance ── */
  createdAt: string
  updatedAt: string
}

/** A new record with every field present, so the admin never sees `undefined`. */
export function blankProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const now = new Date().toISOString()
  const slug = overrides.slug ?? overrides.id ?? `product-${now.slice(0, 10)}`
  return {
    id: slug,
    slug,
    name: '',
    category: 'home',
    environment: 'showroom',
    description: '',
    price: 0,
    currency: 'USD',
    compareAtPrice: null,
    images: { hero: null, transparent: null, gallery: [] },
    rotationSequence: null,
    modelUrl: null,
    sizeClass: 'medium',
    purchaseType: 'stripe',
    stripePriceId: null,
    affiliateUrl: null,
    gumroadUrl: null,
    amazonUrl: null,
    fulfillment: 'manual',
    printfulVariantId: null,
    printifyVariantId: null,
    status: 'draft',
    featured: false,
    tags: [],
    seoTitle: null,
    seoDescription: null,
    lastVerified: null,
    objectType: 'custom',
    tagline: '',
    badge: null,
    careNotes: null,
    materialColor: null,
    renderMode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export type ValidationIssue = {
  field: keyof CatalogProduct | 'images.hero' | 'general'
  message: string
}

/** The sentinel a partner's affiliate link carries until approval. */
export const PENDING_LINK = 'PENDING_APPROVAL'

/**
 * Everything that must be true before a product may be `published`.
 *
 * The rules are the ones from the brief, applied literally. This runs on the
 * server for every status change to `published` — the admin shows the same list
 * inline, but the route is the gate.
 */
export function validateForPublish(p: CatalogProduct): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!p.images.hero) issues.push({ field: 'images.hero', message: 'Needs a hero image.' })
  if (!(p.price > 0)) issues.push({ field: 'price', message: 'Price must be greater than 0.' })
  if (!p.category) issues.push({ field: 'category', message: 'Needs a category.' })
  if (!p.environment) issues.push({ field: 'environment', message: 'Needs an environment.' })
  if (p.purchaseType === 'stripe' && !p.stripePriceId) {
    issues.push({ field: 'stripePriceId', message: 'Stripe products need a Stripe Price ID — use "Create Stripe Price".' })
  }
  if (p.purchaseType === 'affiliate' && (!p.affiliateUrl || p.affiliateUrl === PENDING_LINK)) {
    issues.push({ field: 'affiliateUrl', message: 'Affiliate products need a real affiliate URL, not PENDING_APPROVAL.' })
  }
  if (p.purchaseType === 'gumroad' && !p.gumroadUrl) {
    issues.push({ field: 'gumroadUrl', message: 'Gumroad products need a Gumroad URL.' })
  }
  if (p.purchaseType === 'amazon' && !p.amazonUrl) {
    issues.push({ field: 'amazonUrl', message: 'Amazon products need an Amazon URL.' })
  }
  if (p.fulfillment === 'printful' && !p.printfulVariantId) {
    issues.push({ field: 'printfulVariantId', message: 'Printful products need a Printful variant ID — run "Sync from Printful".' })
  }
  if (p.fulfillment === 'printify' && !p.printifyVariantId) {
    issues.push({ field: 'printifyVariantId', message: 'Printify products need a Printify variant ID — run "Sync from Printify".' })
  }
  if ((p.description ?? '').trim().length <= 50) {
    issues.push({ field: 'description', message: 'Description must be longer than 50 characters.' })
  }
  if (!p.name.trim()) issues.push({ field: 'name', message: 'Needs a name.' })
  return issues
}

/**
 * Coerces an untrusted object — a CSV row, a request body — into a
 * CatalogProduct, dropping unknown keys and rejecting bad enum values.
 * Returns the problems rather than throwing, so an import can report every
 * bad row at once instead of stopping at the first.
 */
export function coerceProduct(
  input: Record<string, unknown>,
  base?: CatalogProduct
): { product: CatalogProduct; problems: string[] } {
  const problems: string[] = []
  const p: CatalogProduct = base ? { ...base } : blankProduct()

  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : undefined)
  const strOrNull = (k: string) => {
    if (!(k in input)) return undefined
    const v = input[k]
    if (v === null || v === '') return null
    return typeof v === 'string' ? v.trim() : String(v)
  }
  const num = (k: string) => {
    if (!(k in input)) return undefined
    const v = input[k]
    if (v === null || v === '') return null
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''))
    if (!Number.isFinite(n)) {
      problems.push(`${k}: "${v}" is not a number`)
      return undefined
    }
    return n
  }
  const oneOf = <T extends string>(k: string, allowed: readonly T[]) => {
    const v = str(k)
    if (v === undefined) return undefined
    if (!(allowed as readonly string[]).includes(v)) {
      problems.push(`${k}: "${v}" must be one of ${allowed.join(', ')}`)
      return undefined
    }
    return v as T
  }
  const list = (k: string) => {
    if (!(k in input)) return undefined
    const v = input[k]
    if (Array.isArray(v)) return v.map(String).filter(Boolean)
    if (typeof v === 'string') return v.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
    return undefined
  }
  const bool = (k: string) => {
    if (!(k in input)) return undefined
    const v = input[k]
    if (typeof v === 'boolean') return v
    return ['true', '1', 'yes', 'y'].includes(String(v).toLowerCase())
  }

  // A record is "new" when there is no base, or the base is an untouched
  // template — then the slug becomes the id. An existing record keeps its id
  // even if its slug is renamed, so links from the admin never dangle.
  const isNew = !base || (base.name === '' && base.id === base.slug)
  const slug = str('slug') ?? (str('name') ? slugify(str('name')!) : undefined)
  if (slug !== undefined) {
    if (!/^[a-z0-9-]+$/.test(slug)) problems.push(`slug: "${slug}" may only contain a-z, 0-9 and hyphens`)
    else {
      p.slug = slug
      if (isNew) p.id = slug
    }
  }

  const name = str('name')
  if (name !== undefined) p.name = name
  const category = oneOf('category', CATALOG_CATEGORIES)
  if (category) p.category = category
  const environment = oneOf('environment', CATALOG_ENVIRONMENTS)
  if (environment) p.environment = environment
  const description = str('description')
  if (description !== undefined) p.description = description
  const price = num('price')
  if (price !== undefined) p.price = price ?? 0
  const compare = num('compareAtPrice')
  if (compare !== undefined) p.compareAtPrice = compare

  const hero = strOrNull('heroImage') ?? strOrNull('images.hero')
  const transparent = strOrNull('transparentImage') ?? strOrNull('images.transparent')
  const gallery = list('gallery') ?? list('images.gallery')
  if (input.images && typeof input.images === 'object') {
    const im = input.images as Partial<CatalogImages>
    p.images = {
      hero: im.hero ?? p.images.hero,
      transparent: im.transparent ?? p.images.transparent,
      gallery: Array.isArray(im.gallery) ? im.gallery.map(String) : p.images.gallery,
    }
  }
  if (hero !== undefined) p.images = { ...p.images, hero }
  if (transparent !== undefined) p.images = { ...p.images, transparent }
  if (gallery !== undefined) p.images = { ...p.images, gallery }

  const rotation = list('rotationSequence')
  if (rotation !== undefined) p.rotationSequence = rotation.length ? rotation : null
  const model = strOrNull('modelUrl')
  if (model !== undefined) p.modelUrl = model
  const size = oneOf('sizeClass', ['small', 'medium', 'large', 'oversized'] as const)
  if (size) p.sizeClass = size
  const purchase = oneOf('purchaseType', ['stripe', 'affiliate', 'gumroad', 'amazon'] as const)
  if (purchase) p.purchaseType = purchase
  for (const k of ['stripePriceId', 'affiliateUrl', 'gumroadUrl', 'amazonUrl', 'printfulVariantId', 'printifyVariantId', 'seoTitle', 'seoDescription', 'lastVerified', 'badge', 'materialColor'] as const) {
    const v = strOrNull(k)
    if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v
  }
  const fulfillment = oneOf('fulfillment', ['printful', 'printify', 'digital', 'affiliate', 'manual'] as const)
  if (fulfillment) p.fulfillment = fulfillment
  const status = oneOf('status', CATALOG_STATUSES)
  if (status) p.status = status
  const featured = bool('featured')
  if (featured !== undefined) p.featured = featured
  const tags = list('tags')
  if (tags !== undefined) p.tags = tags
  const objectType = oneOf('objectType', ['candle', 'print', 'tote', 'mug', 'cleaning', 'book', 'custom'] as const)
  if (objectType) p.objectType = objectType
  const tagline = str('tagline')
  if (tagline !== undefined) p.tagline = tagline
  const care = list('careNotes')
  if (care !== undefined) p.careNotes = care.length ? care : null
  const render = oneOf('renderMode', ['true_3d', 'spin_360', 'depth_interactive'] as const)
  if (render) p.renderMode = render

  p.updatedAt = new Date().toISOString()
  return { product: p, problems }
}

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Column order for CSV export and the import template. */
export const CSV_COLUMNS = [
  'slug',
  'name',
  'category',
  'environment',
  'description',
  'price',
  'compareAtPrice',
  'heroImage',
  'gallery',
  'sizeClass',
  'purchaseType',
  'stripePriceId',
  'affiliateUrl',
  'gumroadUrl',
  'amazonUrl',
  'fulfillment',
  'printfulVariantId',
  'printifyVariantId',
  'status',
  'featured',
  'tags',
  'seoTitle',
  'seoDescription',
  'objectType',
  'tagline',
] as const
