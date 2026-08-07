#!/usr/bin/env node
/**
 * Creates the Stripe Products, Prices, and webhook endpoint for this store,
 * then writes the Price IDs back into content/products.json.
 *
 *   npm run stripe:setup            # dry run — shows what it would do
 *   npm run stripe:setup -- --apply # actually creates things
 *   npm run stripe:setup -- --apply --webhook
 *
 * Runs locally, with your own STRIPE_SECRET_KEY, for two reasons: creating
 * billing objects in a live account is the account holder's decision, and the
 * webhook signing secret is shown once, to you.
 *
 * Idempotent. Every Product carries `metadata.ic_slug`, and the script
 * searches on it before creating anything — so a second run adopts what
 * already exists instead of making duplicates.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PRODUCTS_FILE = path.join(ROOT, 'content', 'products.json')

const APPLY = process.argv.includes('--apply')
const DO_WEBHOOK = process.argv.includes('--webhook')

function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m || process.env[m[1]]) continue
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

async function main() {
  loadEnvFile()

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    console.error(
      'STRIPE_SECRET_KEY is not set.\n\n' +
        'Find it at dashboard.stripe.com → Developers → API keys, then either:\n' +
        '  echo "STRIPE_SECRET_KEY=sk_test_..." >> .env.local\n' +
        'or run:\n' +
        '  STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup -- --apply\n\n' +
        'Use a sk_test_ key first — everything here is reversible in test mode.'
    )
    process.exit(1)
  }

  const live = key.startsWith('sk_live_')
  const Stripe = require('stripe')
  const stripe = new Stripe(key)

  console.log(`Stripe mode: ${live ? 'LIVE' : 'test'}`)
  if (!APPLY) console.log('DRY RUN — nothing will be created. Re-run with --apply.\n')
  if (live && APPLY) {
    console.log('⚠️  Creating objects in your LIVE account.\n')
  }

  // ── 1. What already exists ───────────────────────────────────────────
  const existing = await stripe.products.list({ limit: 100, active: true })
  console.log(`Existing active Stripe products: ${existing.data.length}`)
  for (const p of existing.data) {
    console.log(`  · ${p.name}${p.metadata?.ic_slug ? `  [${p.metadata.ic_slug}]` : ''}`)
  }
  console.log('')

  const bySlug = new Map()
  for (const p of existing.data) {
    if (p.metadata?.ic_slug) bySlug.set(p.metadata.ic_slug, p)
  }

  // ── 2. Create missing Products and Prices ────────────────────────────
  const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'))
  let created = 0
  let adopted = 0

  for (const item of products) {
    if (!(item.price > 0) || item.comingSoon) {
      console.log(`skip   ${item.slug} (${item.comingSoon ? 'coming soon' : 'no price'})`)
      continue
    }

    const amount = Math.round(item.price * 100)
    let product = bySlug.get(item.slug)

    if (product) {
      adopted++
      console.log(`found  ${item.slug} → ${product.id}`)
    } else {
      console.log(`create ${item.slug} — ${item.name} @ $${item.price.toFixed(2)}`)
      if (!APPLY) continue

      product = await stripe.products.create({
        name: item.name,
        description: item.tagline || undefined,
        images: item.heroImage?.startsWith('https://') ? [item.heroImage] : undefined,
        metadata: {
          ic_slug: item.slug,
          // The webhook reads this when session metadata is unavailable.
          printfulVariantId:
            item.channels?.printfulId && item.channels.printfulId !== 'TODO'
              ? item.channels.printfulId
              : '',
        },
        // Lets Stripe Tax pick the right rate per jurisdiction.
        tax_code: 'txcd_99999999',
      })
      created++
    }

    if (!APPLY) continue

    // Reuse a matching active price; Stripe prices are immutable, so a change
    // of amount means a new Price, and the old one is left for existing links.
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
    let price = prices.data.find((p) => p.unit_amount === amount && p.currency === 'usd')

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: amount,
        tax_behavior: 'exclusive',
      })
      console.log(`       new price ${price.id} ($${item.price.toFixed(2)})`)
    } else {
      console.log(`       price ${price.id} already matches`)
    }

    item.channels.stripePriceId = price.id
  }

  if (APPLY) {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2) + '\n')
    console.log(`\nWrote Price IDs into content/products.json`)
    console.log(`Products created: ${created}, adopted: ${adopted}`)
    console.log('Review the diff and commit it — checkout reads these IDs.')
  }

  // ── 3. Webhook endpoint ──────────────────────────────────────────────
  if (!DO_WEBHOOK) {
    console.log('\n(Skipping webhook. Re-run with --webhook to create it.)')
    return
  }

  const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://interiorcleanse.com'}/api/webhook/`
  console.log(`\nWebhook endpoint: ${url}`)
  console.log('  (the trailing slash is required — see VERCEL_ENV_SETUP.md)')

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const already = endpoints.data.find((e) => e.url === url)

  if (already) {
    console.log(`\nAn endpoint for that URL already exists: ${already.id}`)
    console.log('Stripe only reveals a signing secret at creation time.')
    console.log('If you no longer have it: dashboard.stripe.com → Developers →')
    console.log('Webhooks → select the endpoint → "Roll secret".')
    return
  }

  if (!APPLY) {
    console.log('\nWould create the endpoint for: checkout.session.completed')
    return
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: ['checkout.session.completed'],
    description: 'InteriorCleanse — Printful fulfilment, Brevo sync, AI email',
  })

  console.log(`\nCreated webhook endpoint ${endpoint.id}`)
  console.log('\n──────────────────────────────────────────────────────────')
  console.log('SIGNING SECRET (shown once — copy it now):')
  console.log(`\n  ${endpoint.secret}\n`)
  console.log('Add it in Vercel → Settings → Environment Variables as')
  console.log('STRIPE_WEBHOOK_SECRET, then redeploy.')
  console.log('──────────────────────────────────────────────────────────')
}

main().catch((e) => {
  console.error('\nFailed:', e.message)
  process.exit(1)
})
