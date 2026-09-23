#!/usr/bin/env node
/**
 * Move the products the site already sells into the catalog.
 *
 * content/books.json and content/digital-products.json predate the catalog
 * and still drive /library. The catalog's draft shells for books and downloads
 * were empty. This fills them from the real records — titles, copy, covers,
 * Gumroad paths — so the owner edits facts rather than typing them twice.
 *
 * Nothing is invented. Records whose channel link is still a placeholder
 * (Amazon's homepage, a Gumroad path with no store confirmed) land as
 * `needs-assets`, which keeps them off the storefront until the link is real.
 * Shells with no real product behind them (merch 1–5, cleaning 1–5,
 * downloads 4–5) are left as they are.
 *
 *   node scripts/fill-drafts-from-content.mjs          # writes catalog.json
 *   node scripts/fill-drafts-from-content.mjs --dry    # prints the plan
 */
import { readFileSync, writeFileSync } from 'node:fs'

const dry = process.argv.includes('--dry')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const catalog = read('content/catalog.json')
const books = read('content/books.json')
const digital = read('content/digital-products.json')
const now = new Date().toISOString()

const PLACEHOLDER_AMAZON = /^https:\/\/www\.amazon\.com\/?(kindle-dbs\/storefront)?$/
const bySlug = new Map(catalog.map((p) => [p.slug, p]))
const changes = []

function take(shellSlug, patch) {
  const shell = bySlug.get(shellSlug)
  if (!shell) return
  if (shell.name && !/^Untitled /.test(shell.name)) {
    changes.push(`skip ${shellSlug}: already edited (${shell.name})`)
    return
  }
  if (bySlug.has(patch.slug)) {
    changes.push(`skip ${shellSlug}: ${patch.slug} already in catalog`)
    return
  }
  Object.assign(shell, patch, { id: patch.slug, updatedAt: now })
  bySlug.delete(shellSlug)
  bySlug.set(patch.slug, shell)
  changes.push(`${shellSlug} → ${patch.slug} (${patch.status})`)
}

books.forEach((b, i) => {
  const url = b.paperbackUrl && !PLACEHOLDER_AMAZON.test(b.paperbackUrl) ? b.paperbackUrl : null
  const description = [b.hook, ...(b.bullets ?? []).map((x) => `${x}.`)].join(' ')
  take(`book-draft-${i + 1}`, {
    slug: b.slug,
    name: b.title,
    tagline: b.subtitle,
    description,
    category: 'books',
    environment: b.track === 'health' ? 'conservatory' : 'library',
    purchaseType: 'amazon',
    fulfillment: 'manual',
    amazonUrl: url,
    price: 0,
    images: { hero: b.coverImage ?? null, transparent: null, gallery: [] },
    featured: Boolean(b.featured),
    tags: ['books', b.track ?? 'mind'],
    seoTitle: `${b.title} — ${b.subtitle}`,
    seoDescription: b.hook,
    objectType: 'book',
    sizeClass: 'small',
    // Amazon link is the homepage placeholder and the cover is stock: not sellable yet.
    status: url ? 'needs-pricing' : 'needs-assets',
  })
})

digital.forEach((d, i) => {
  const price = d.price === 'Free' ? 0 : Number(String(d.price).replace(/[^0-9.]/g, '')) || 0
  const description = [d.description, ...(d.bullets ?? []).map((x) => `${x}.`)].join(' ')
  take(`digital-draft-${i + 1}`, {
    slug: d.slug,
    name: d.title,
    tagline: d.subtitle,
    description,
    category: 'digital',
    environment: 'gallery',
    purchaseType: 'gumroad',
    fulfillment: 'digital',
    // The path is real; the store host is confirmed by Validate Gumroad in the admin.
    gumroadUrl: null,
    price,
    images: { hero: d.coverImage ?? null, transparent: null, gallery: [] },
    tags: ['digital', d.format ? d.format.split(' ')[0].toLowerCase() : 'pdf'],
    seoTitle: `${d.title} — ${d.subtitle}`,
    seoDescription: d.description,
    careNotes: d.format ?? null,
    objectType: 'print',
    sizeClass: 'medium',
    status: 'needs-assets',
  })
})

for (const line of changes) console.log(line)
if (!dry) {
  writeFileSync('content/catalog.json', JSON.stringify(catalog, null, 2) + '\n')
  const counts = {}
  for (const p of catalog) counts[p.status] = (counts[p.status] ?? 0) + 1
  console.log('wrote content/catalog.json', counts)
}
