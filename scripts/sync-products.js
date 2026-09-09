#!/usr/bin/env node
/**
 * Pulls the Printful and Printify catalogues into content/catalog.json.
 *
 * The same sync, from the browser, is the "Sync from Printful / Printify"
 * button in /admin/products (which on Vercel commits through GitHub). This is
 * the local form: the write lands in your checkout, to review and commit.
 *
 * Follows the same rules as lib/catalog-sync.ts: a new product arrives as
 * needs-pricing with the provider's mockups and variant id and NO price — the
 * owner sets retail. A re-sync refreshes only provider-owned facts and never
 * touches a name, description, price, status, or an uploaded image.
 *
 *   npm run sync
 *
 * Reads .env.local if present, so it works without exporting variables.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TARGET = path.join(ROOT, 'content', 'catalog.json')

/** Minimal .env parser — avoids a dependency for four variables. */
function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.replace(/^["']|["']$/g, '')
    }
  }
}

const slugify = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function detectCategory(name) {
  const n = String(name).toLowerCase()
  if (n.includes('tote') || n.includes('bag')) return 'tote'
  if (n.includes('mug') || n.includes('cup')) return 'mug'
  if (n.includes('poster') || n.includes('print') || n.includes('canvas')) return 'print'
  if (n.includes('candle')) return 'candle'
  if (n.includes('hoodie') || n.includes('shirt') || n.includes('tee') || n.includes('sweat'))
    return 'custom'
  return 'custom'
}

const num = (v) => {
  const n = parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

async function json(url, headers) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchPrintful() {
  const key = process.env.PRINTFUL_API_KEY
  if (!key) return []

  const headers = { Authorization: `Bearer ${key}` }
  if (process.env.PRINTFUL_STORE_ID) {
    headers['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID
  }

  const list = await json('https://api.printful.com/store/products', headers)
  const out = []

  for (const item of list.result ?? []) {
    const detail = await json(`https://api.printful.com/store/products/${item.id}`, headers)
    const variants = detail.result?.sync_variants ?? []
    const gallery = variants
      .slice(0, 4)
      .map((v) => (v.files ?? []).find((f) => f.type === 'preview')?.preview_url)
      .filter(Boolean)

    out.push({
      slug: slugify(item.name),
      name: item.name,
      category: detectCategory(item.name),
      tagline: '',
      description: '',
      price: num(variants[0]?.retail_price),
      heroImage: item.thumbnail_url ?? gallery[0] ?? '',
      gallery,
      viewer: { mode: 'static' },
      channels: { website: true, printfulId: String(item.id) },
      variants: variants.map((v) => ({
        id: String(v.id),
        name: v.name,
        price: num(v.retail_price),
        size: v.size,
        color: v.color,
      })),
      featured: true,
      comingSoon: false,
      badge: 'NEW',
    })
  }
  return out
}

async function fetchPrintify() {
  const key = process.env.PRINTIFY_API_KEY
  const shop = process.env.PRINTIFY_SHOP_ID
  if (!key || !shop) return []

  const data = await json(`https://api.printify.com/v1/shops/${shop}/products.json`, {
    Authorization: `Bearer ${key}`,
  })

  return (data.data ?? []).map((item) => {
    const variants = (item.variants ?? []).filter((v) => v.is_enabled !== false)
    const images = (item.images ?? []).slice(0, 4).map((i) => i.src).filter(Boolean)
    const toDollars = (cents) => num(cents) / 100

    return {
      slug: slugify(item.title),
      name: item.title,
      category: detectCategory(item.title),
      tagline: '',
      description: '',
      price: toDollars(variants[0]?.price),
      heroImage: images[0] ?? '',
      gallery: images,
      viewer: { mode: 'static' },
      channels: { website: true, printifyId: String(item.id) },
      variants: variants.map((v) => ({
        id: String(v.id),
        name: v.title,
        price: toDollars(v.price),
      })),
      featured: true,
      comingSoon: false,
      badge: 'NEW',
    }
  })
}

const CATEGORY = { candle: 'fragrance', cleaning: 'cleaning', print: 'wall-art', tote: 'merch', mug: 'home', custom: 'merch', book: 'books' }
const ENVIRONMENT = { candle: 'atrium', cleaning: 'cleaning', print: 'gallery', tote: 'atelier', mug: 'atelier', custom: 'atelier', book: 'library' }

/** Same rules as lib/catalog-sync.ts — kept in step by hand, so read both when changing either. */
function merge(existing, incoming, provider) {
  const now = new Date().toISOString()
  const created = []
  const updated = []
  for (const s of incoming) {
    const variantId = provider === 'printful' ? s.channels.printfulId : s.channels.printifyId
    const idKey = provider === 'printful' ? 'printfulVariantId' : 'printifyVariantId'
    let p = existing.find((x) => x.slug === s.slug || (variantId && x[idKey] === variantId))
    if (!p) {
      existing.push({
        id: s.slug, slug: s.slug, name: s.name,
        category: CATEGORY[s.category] ?? 'merch',
        environment: ENVIRONMENT[s.category] ?? 'atelier',
        description: '', price: 0, currency: 'USD', compareAtPrice: null,
        images: { hero: s.heroImage || null, transparent: null, gallery: s.gallery ?? [] },
        rotationSequence: null, modelUrl: null,
        sizeClass: s.category === 'mug' || s.category === 'candle' ? 'small' : 'medium',
        purchaseType: 'stripe', stripePriceId: null, affiliateUrl: null, gumroadUrl: null, amazonUrl: null,
        fulfillment: provider,
        printfulVariantId: provider === 'printful' ? variantId : null,
        printifyVariantId: provider === 'printify' ? variantId : null,
        status: 'needs-pricing', featured: false, tags: [s.category, provider],
        seoTitle: null, seoDescription: null, lastVerified: null,
        objectType: s.category, tagline: '', badge: 'NEW', careNotes: null, materialColor: null, renderMode: null,
        createdAt: now, updatedAt: now,
      })
      created.push(s.slug)
      continue
    }
    const before = JSON.stringify(p)
    p[idKey] = variantId
    if (p.fulfillment === 'manual') p.fulfillment = provider
    if (!p.images.hero && s.heroImage) p.images.hero = s.heroImage
    if (p.images.gallery.length === 0 && s.gallery?.length) p.images.gallery = s.gallery
    if (!p.tags.includes(provider)) p.tags.push(provider)
    if (JSON.stringify(p) !== before) { p.updatedAt = now; updated.push(p.slug) }
  }
  return { created, updated }
}

async function main() {
  loadEnvFile()

  if (!process.env.PRINTFUL_API_KEY && !process.env.PRINTIFY_API_KEY) {
    console.error(
      'No provider credentials found.\n' +
        'Set PRINTFUL_API_KEY (and PRINTFUL_STORE_ID), and/or\n' +
        'PRINTIFY_API_KEY + PRINTIFY_SHOP_ID in .env.local.\n' +
        'See VERCEL_ENV_SETUP.md for where to find them.'
    )
    process.exit(1)
  }

  const existing = JSON.parse(fs.readFileSync(TARGET, 'utf8'))

  const [printful, printify] = await Promise.all([
    fetchPrintful().catch((e) => {
      console.error(`Printful sync failed: ${e.message}`)
      return []
    }),
    fetchPrintify().catch((e) => {
      console.error(`Printify sync failed: ${e.message}`)
      return []
    }),
  ])

  console.log(`Printful: ${printful.length} products`)
  console.log(`Printify: ${printify.length} products`)

  if (printful.length === 0 && printify.length === 0) {
    console.error('Nothing fetched — leaving content/catalog.json untouched.')
    process.exit(1)
  }

  const a = merge(existing, printful, 'printful')
  const b = merge(existing, printify, 'printify')
  existing.sort((x, y) => x.slug.localeCompare(y.slug))
  fs.writeFileSync(TARGET, JSON.stringify(existing, null, 2) + '\n')
  console.log(`Printful: ${a.created.length} new, ${a.updated.length} updated`)
  console.log(`Printify: ${b.created.length} new, ${b.updated.length} updated`)
  console.log(`Wrote ${existing.length} records to content/catalog.json`)
  console.log('New products are needs-pricing: set retail prices in /admin/products, then commit.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
