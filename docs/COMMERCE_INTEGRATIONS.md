# Commerce Integrations

Status is stated per integration as **Connected**, **Adapter only**, or
**Not started**. "Adapter only" means the code exists and is exercised by
fixtures, but no credential has ever been validated against the live API.

## Current status

| Source | Status | Evidence |
| --- | --- | --- |
| Stripe checkout | Adapter only — **no Price IDs minted** | `content/products.json`: every `stripePriceId` is `null` |
| Stripe webhook | Adapter only | `app/api/webhook/route.ts` verified by inspection, never by a live event |
| Printful | Adapter only | `lib/print-providers.ts`, `app/api/printful/sync/route.ts` |
| Printify | Adapter only | `lib/print-providers.ts`, `app/api/printify/sync/route.ts` |
| Brevo CRM | Adapter only | `lib/brevo.ts` |
| Amazon books | Manual links, working | `content/books.json` — owner-entered URLs |
| TikTok Shop | Not started | `tiktokShopUrl: "TODO"` on every product |
| Digital wallpapers | Not started | No wallpaper category exists |
| Kie.ai | Not started | See `KIE_ASSET_PIPELINE.md` |

## The unified product model

The brief requires that a customer never be misled about where a purchase
happens. That is enforced by two fields, not by convention:

```ts
sourceType: 'owned' | 'printful' | 'printify' | 'amazon' | 'tiktok' | 'digital'
checkoutMode:
  | 'internal_physical'    // our cart, our Stripe, provider fulfils
  | 'internal_digital'     // our cart, secure download delivery
  | 'external_amazon'      // leaves the site, Amazon takes the money
  | 'external_tiktok'      // leaves the site, TikTok takes the money
  | 'inquiry_or_consultation'
externalPurchaseUrl?: string
```

**Rules the code must enforce, not merely document:**

- An item whose `checkoutMode` starts with `external_` must never enter the
  internal cart. `AddToCartButton` should refuse it rather than trust callers.
- Every CTA states its destination. `external_amazon` renders "Buy on Amazon ↗",
  never "Add to cart".
- A collection may mix modes. A cart may not.
- `priceSource` records whether a displayed price is ours (authoritative) or a
  provider's (a snapshot). Amazon prices are never displayed — they change
  hourly and we have no authorized live feed.

## Stripe — the launch blocker

Six products, zero Price IDs. Checkout 409s on all of them.

**Owner action, cannot be done by an agent:**

```bash
npm run stripe:setup            # dry run, prints what it would create
npm run stripe:setup -- --apply # creates Products/Prices, writes IDs back to content/products.json
npm run stripe:setup -- --webhook
```

The script is idempotent via `metadata.ic_slug`, so re-running it will not
duplicate anything.

**The trailing-slash trap.** `next.config.js` sets `trailingSlash: true`, so
Next.js 308-redirects `/api/webhook` → `/api/webhook/`. Stripe does not follow
redirects when delivering webhooks. The endpoint URL registered in the Stripe
dashboard **must** be:

```
https://interiorcleanse.com/api/webhook/
```

Without the trailing slash every event fails silently — 308, no retry that ever
succeeds, no order ever fulfilled.

## Printful

- Official endpoints only; token server-side via `env.printfulKey()`.
- Sync products and variants; preserve `printfulId` on our record.
- **Mockup generation is asynchronous.** A create call returns a task, not an
  image. Required: persist the task, poll as a fallback, accept the webhook as
  the fast path, retry with backoff, and show sync status in admin.
- Order submission must be idempotent — an idempotency key per order, so a
  webhook redelivery cannot fulfil twice.
- Official mockups become `spinFrames` when multi-angle, `posterUrl` otherwise.
- Kie.ai must never touch a print file. The artwork is composited, never generated.

## Printify

- Correct merchant shop ID; token server-side; a valid `User-Agent` header is
  required by their API.
- Honor global and catalog rate limits.
- Import products, variants, images, pricing. Preserve `printifyId`.
- Webhooks for product and order updates; make handlers idempotent.
- **Catalog import succeeding does not mean fulfilment is connected.** These are
  separate states and the admin must show them separately.

## Amazon books

- **Do not implement PA-API 5** — deprecated.
- Use the Amazon Creators API only once the account is approved. Until then,
  owner-entered ASIN/URL metadata is the supported path and works today.
- Do not scrape. Do not display a live price, rating, review count,
  availability, bestseller rank, or delivery date — we have no authorized
  current source for any of them.
- 3D book covers use owner-supplied front/spine/back files. Kie.ai must never
  alter title, subtitle, author name, or cover art.
- Affiliate links keep their tags and require the Amazon Associate disclosure —
  `app/legal/affiliate-disclosure/page.tsx` already exists.

## TikTok Shop

Two distinct modes, and the difference is legal, not cosmetic:

1. **Authorized seller** — official TikTok Shop APIs, minimum necessary scopes,
   stored shop IDs, catalog/variant/inventory sync, connector health in admin.
2. **Curated external** — owner-entered products with permitted images and
   outbound links. `checkoutMode: 'external_tiktok'`, outbound click analytics,
   and **not** addable to the internal cart.

Mode 2 ships first because it needs no partner approval. Do not scrape TikTok
under either mode.

## Digital wallpapers

Not started. When built, `internal_digital` requires all of:

- signed, expiring download URLs — never a public storage URL;
- a per-order download limit;
- a customer library tied to the order;
- format, resolution, and per-device aspect crops;
- explicit license terms at purchase.

This needs a database and a storage bucket. It cannot be done with flat JSON.

## Analytics events

Fire-and-forget, never blocking a purchase path:

`category_view`, `product_view`, `product_3d_started`, `product_rotated`,
`product_hotspot_opened`, `variant_selected`, `add_to_cart`, `checkout_started`,
`purchase_completed`, `amazon_outbound`, `tiktok_outbound`,
`ai_project_started`, `ai_generation_submitted`, `ai_generation_completed`,
`wallpaper_downloaded`, `connector_sync_failed`.

## Credentials required from the owner

None of these can be obtained by an agent.

| Variable | Unblocks |
| --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | All internal checkout |
| `PRINTFUL_API_KEY`, `PRINTFUL_STORE_ID` | Printful sync + fulfilment |
| `PRINTIFY_API_KEY`, `PRINTIFY_SHOP_ID` | Printify import |
| `BREVO_API_KEY` | CRM + transactional email |
| `ANTHROPIC_API_KEY` | AI email engine |
| `KIE_API_KEY` | Asset pipeline + AI studio |
| TikTok Shop app credentials | Authorized seller sync |
| `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | Admin access |

Paste live keys into the Vercel dashboard directly. `.env.example` carries
placeholders only and no real key belongs in this repository.
