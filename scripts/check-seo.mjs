#!/usr/bin/env node
/**
 * SEO sweep of every URL in the sitemap, against a running server.
 *
 * Checks each route for: a 200, a title under 65 characters, a description
 * between 70 and 160, a canonical that matches the route, an og:image,
 * exactly one h1, and no title or description shared with another route.
 *
 *   npm run check:seo                    # against http://localhost:3000
 *   BASE_URL=https://example.com npm run check:seo
 *
 * Exits 1 when any route has a problem, so it can gate a workflow.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SITE = 'https://interiorcleanse.com'

const xml = await (await fetch(`${BASE}/sitemap.xml`)).text()
const routes = [...xml.matchAll(new RegExp(`<loc>${SITE}([^<]*)</loc>`, 'g'))].map((m) => m[1] || '/')
if (!routes.length) {
  console.error(`No routes found in ${BASE}/sitemap.xml`)
  process.exit(1)
}

const seenTitle = new Map()
const seenDesc = new Map()
let failures = 0

for (const r of routes) {
  const res = await fetch(BASE + r)
  const html = await res.text()
  const pick = (re) => (html.match(re) || [])[1]
  const title = pick(/<title[^>]*>([^<]*)<\/title>/)
  const desc = pick(/<meta name="description" content="([^"]*)"/)
  const canonical = pick(/<link rel="canonical" href="([^"]*)"/)
  const og = pick(/<meta property="og:image" content="([^"]*)"/)
  const h1 = (html.match(/<h1[\s>]/g) || []).length
  const problems = []
  if (res.status !== 200) problems.push(`status ${res.status}`)
  if (!title) problems.push('no title')
  else if (title.length > 65) problems.push(`title ${title.length} chars`)
  if (!desc) problems.push('no description')
  else if (desc.length < 70 || desc.length > 160) problems.push(`description ${desc.length} chars`)
  if (!canonical) problems.push('no canonical')
  else if (canonical !== SITE + r) problems.push(`canonical is ${canonical}`)
  if (!og) problems.push('no og:image')
  if (h1 !== 1) problems.push(`${h1} h1 elements`)
  if (title) {
    if (seenTitle.has(title)) problems.push(`title duplicates ${seenTitle.get(title)}`)
    else seenTitle.set(title, r)
  }
  if (desc) {
    if (seenDesc.has(desc)) problems.push(`description duplicates ${seenDesc.get(desc)}`)
    else seenDesc.set(desc, r)
  }
  if (problems.length) failures++
  console.log(`${problems.length ? 'FAIL' : ' ok '} ${r.padEnd(44)} ${problems.join('; ')}`)
}

console.log(`\n${failures} of ${routes.length} routes with problems`)
process.exit(failures ? 1 : 0)
