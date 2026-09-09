#!/usr/bin/env node
/**
 * Seeds content/catalog.json from the older content files, once.
 *
 *   node scripts/seed-catalog.mjs            # refuses if catalog.json exists
 *   node scripts/seed-catalog.mjs --force    # rebuilds it
 *
 * What it produces:
 * - every product in content/products.json, migrated field-for-field —
 *   the five with Stripe Price IDs become `published`, the unpriced one
 *   becomes `needs-pricing`
 * - every partner in content/partners.json as an affiliate record with
 *   status `needs-assets` (no photography, no approved link yet)
 * - twenty draft shells across four categories, with a name placeholder, a
 *   category, and an environment, for the owner to fill in via /admin/products
 *
 * Nothing here invents a price, a link, or a photograph. Placeholders say
 * "Untitled" and stay `draft` until a person edits them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'content', 'catalog.json')
const force = process.argv.includes('--force')

if (existsSync(OUT) && !force) {
  console.error('content/catalog.json already exists. Re-run with --force to rebuild it.')
  process.exit(1)
}

const products = JSON.parse(readFileSync(join(ROOT, 'content', 'products.json'), 'utf8'))
const partners = JSON.parse(readFileSync(join(ROOT, 'content', 'partners.json'), 'utf8'))
const now = new Date().toISOString()

const blank = (o) => ({
  id: o.slug,
  slug: o.slug,
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
  ...o,
})

// Merchandising category and environment per object type, from the showroom
// and scene manifests as they stand.
const CATEGORY = { candle: 'fragrance', cleaning: 'cleaning', print: 'wall-art', tote: 'merch', mug: 'home', custom: 'merch', book: 'books' }
const ENVIRONMENT = { candle: 'atrium', cleaning: 'cleaning', print: 'gallery', tote: 'atelier', mug: 'atelier', custom: 'atelier', book: 'library' }
const SIZE = { candle: 'small', book: 'small', print: 'medium', tote: 'medium', mug: 'small', custom: 'medium', cleaning: 'medium' }
const valid = (u) => typeof u === 'string' && u !== 'TODO' && /^https?:\/\//.test(u)

const out = []

// ── 1. Existing products ─────────────────────────────────────────────
for (const p of products) {
  const stripe = p.channels?.stripePriceId ?? null
  const external = p.checkoutMode?.startsWith('external_')
  const purchaseType = external
    ? p.checkoutMode === 'external_amazon' ? 'amazon' : 'affiliate'
    : 'stripe'
  const fulfillment = p.channels?.printfulId && p.channels.printfulId !== 'TODO'
    ? 'printful'
    : p.channels?.printifyId && p.channels.printifyId !== 'TODO'
      ? 'printify'
      : external ? 'affiliate' : 'manual'
  const status = p.comingSoon
    ? (p.price > 0 ? 'needs-assets' : 'needs-pricing')
    : stripe && p.price > 0 ? 'published' : 'needs-pricing'

  out.push(blank({
    slug: p.slug,
    name: p.name,
    category: CATEGORY[p.category] ?? 'home',
    environment: ENVIRONMENT[p.category] ?? 'showroom',
    description: p.description ?? '',
    price: p.price ?? 0,
    images: { hero: p.heroImage || null, transparent: null, gallery: p.gallery ?? [] },
    rotationSequence: p.spinFrames?.length ? p.spinFrames : null,
    modelUrl: p.modelUrl ?? null,
    sizeClass: SIZE[p.category] ?? 'medium',
    purchaseType,
    stripePriceId: stripe,
    affiliateUrl: p.checkoutMode === 'external_tiktok' ? (p.externalPurchaseUrl ?? null) : null,
    amazonUrl: valid(p.channels?.amazonUrl) ? p.channels.amazonUrl : (p.checkoutMode === 'external_amazon' ? p.externalPurchaseUrl ?? null : null),
    fulfillment,
    printfulVariantId: p.channels?.printfulId && p.channels.printfulId !== 'TODO' ? String(p.channels.printfulId) : null,
    printifyVariantId: p.channels?.printifyId && p.channels.printifyId !== 'TODO' ? String(p.channels.printifyId) : null,
    status,
    featured: Boolean(p.featured),
    tags: [p.category, ...(p.checkoutMode === 'external_tiktok' ? ['tiktok'] : [])],
    seoTitle: null,
    seoDescription: p.tagline || null,
    lastVerified: null,
    objectType: p.category,
    tagline: p.tagline ?? '',
    badge: p.badge ?? null,
    careNotes: p.careNotes ?? null,
    materialColor: p.materialColor ?? null,
    renderMode: p.renderMode ?? null,
  }))
}

// ── 2. Partners ──────────────────────────────────────────────────────
for (const pt of partners) {
  out.push(blank({
    slug: `partner-${pt.id}`,
    name: pt.brand,
    category: 'partners',
    environment: 'pavilion',
    description: pt.editorialNote ?? '',
    price: 0,
    sizeClass: pt.category === 'furniture' ? 'large' : 'oversized',
    purchaseType: 'affiliate',
    affiliateUrl: pt.affiliateLink ?? 'PENDING_APPROVAL',
    fulfillment: 'affiliate',
    status: 'needs-assets',
    tags: ['partner', pt.category],
    lastVerified: pt.lastVerified ?? null,
    objectType: 'custom',
    tagline: pt.commissionNote ? '' : '',
  }))
}

// ── 3. Twenty draft shells ───────────────────────────────────────────
const shells = [
  ...Array.from({ length: 5 }, (_, i) => ({ slug: `book-draft-${i + 1}`, name: `Untitled book ${i + 1}`, category: 'books', environment: 'library', purchaseType: 'amazon', fulfillment: 'manual', objectType: 'book', sizeClass: 'small' })),
  ...Array.from({ length: 5 }, (_, i) => ({ slug: `digital-draft-${i + 1}`, name: `Untitled download ${i + 1}`, category: 'digital', environment: 'gallery', purchaseType: 'gumroad', fulfillment: 'digital', objectType: 'print', sizeClass: 'medium' })),
  ...Array.from({ length: 5 }, (_, i) => ({ slug: `merch-draft-${i + 1}`, name: `Untitled merch ${i + 1}`, category: 'merch', environment: 'atelier', purchaseType: 'stripe', fulfillment: 'printful', objectType: 'custom', sizeClass: 'medium' })),
  ...Array.from({ length: 5 }, (_, i) => ({ slug: `cleaning-draft-${i + 1}`, name: `Untitled cleaning pick ${i + 1}`, category: 'cleaning', environment: 'cleaning', purchaseType: 'affiliate', fulfillment: 'affiliate', objectType: 'cleaning', sizeClass: 'medium', tags: ['cleaning', 'tiktok'] })),
]
for (const s of shells) out.push(blank({ ...s, status: 'draft', tags: s.tags ?? [s.category] }))

out.sort((a, b) => a.slug.localeCompare(b.slug))
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')

const counts = {}
for (const p of out) counts[p.status] = (counts[p.status] ?? 0) + 1
console.log(`Wrote ${out.length} records to content/catalog.json`)
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`)
