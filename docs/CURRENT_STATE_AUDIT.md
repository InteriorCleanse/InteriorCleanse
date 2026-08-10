# Current State Audit

Audited at commit `c33135e` on branch `claude/interiorcleanse-3d-rebuild-ewspkq`.
Method: static inspection of the full route/component tree, product data, and
integration modules, plus `npm run build`. Findings are limited to what was
verified in this repository — no claims are made about live production state.

## Stack (verified, keep it)

| Layer | Actual |
| --- | --- |
| Framework | Next.js 14.2 App Router, React 18.3, TypeScript 5 |
| Styling | Tailwind 3.4 + a large hand-written `app/globals.css` (~2400 lines) that carries the real design system |
| 3D | React Three Fiber 8.17 + drei 9.114 + postprocessing 2.16 (React 18-compatible line — do not jump to r3f v9, it requires React 19) |
| Secondary 3D | Babylon.js 7.34, used by `components/3d/BabylonViewer.tsx` |
| Motion | GSAP 3.12, Framer Motion 11, Lenis 1.1, Rive, dotLottie |
| Commerce | Stripe 17.5 (server) + `@stripe/stripe-js` 5.5 (client) |
| Data | Flat JSON in `content/` — no database |
| Hosting | Vercel. `output: 'export'` was removed deliberately; API routes and middleware require a server runtime |

## What works

- **Build is green.** `npm run build` compiles with zero errors and zero warnings.
  30 routes generate: 20 static/SSG pages, 9 API routes, 1 middleware bundle.
- **Checkout is architecturally sound and safe.** `app/api/checkout/route.ts`
  accepts only `{slug, quantity}`, resolves the price server-side via
  `getProduct(slug).channels.stripePriceId`, and returns 409 rather than
  guessing when no Price ID exists. A client cannot inject a price.
- **Webhook is correct.** `app/api/webhook/route.ts` pins `runtime = 'nodejs'`,
  reads the raw body with `req.text()`, verifies with `constructEventAsync`, and
  isolates its three side effects (Printful → Brevo → AI email) so one failure
  cannot roll back the others.
- **Admin auth is real.** `lib/admin-auth.ts` issues HMAC-signed session tokens
  over Web Crypto (works in both the Edge middleware and Node routes).
  `middleware.ts` gates `/admin/:path*` and `/api/admin/:path*`.
- **Environment handling degrades correctly.** `lib/env.ts` treats every
  integration as optional at build time and required only at call time, so a
  missing Printful key breaks Printful sync — not the build, not the storefront.
- **The 3D product viewer works.** `ProductStage` renders procedural geometry
  per category with ACES tone mapping, contact shadows, bloom, and orbit
  controls that stop auto-rotating once the visitor takes hold.
- **Brand palette is already correct.** `--ink: #1C1A17`, `--bone: #F7F4EF`,
  `--brass: #A9895A`, `--sage: #5B6357` match the locked identity exactly.

## What is incomplete

| # | Gap | Evidence |
| --- | --- | --- |
| 1 | **Nothing is sellable.** All 6 products have `channels.stripePriceId: null` (the 7th, `cleaning-picks`, has none at all). Checkout returns 409 for every item. | `content/products.json` |
| 2 | **No render-mode system.** All 6 products carry `viewer.mode: "static"`. The three modes the brief requires (`true_3d` / `spin_360` / `depth_interactive`) do not exist as a concept in the data model. | `lib/types.ts:20-26` |
| 3 | **Product cards are flat.** `ProductCard` is a plain `<img>` in a `<Link>` — no dimensional response to pointer, hover, focus, or touch. | `components/cards.tsx:14-35` |
| 4 | **No unified commerce model.** `Product` has no `source_type`, `checkout_mode`, `fulfillment_provider`, `external_purchase_url`, `inventory_state`, or `sync_status`. Amazon/Etsy/TikTok links live as loose `TODO` strings in `channels`. | `lib/types.ts:27-40` |
| 5 | **Missing categories.** No `/shop/books`, `/shop/apparel`, `/shop/home`, `/shop/wall-art`, `/shop/wallpapers`, `/shop/tiktok-finds`, `/shop/new`, `/shop/bestsellers`. `/shop` is a single flat grid. | route tree |
| 6 | **No AI design studio.** No upload, no room-type selection, no job queue, no project persistence. | route tree |
| 7 | **No Kie.ai integration.** No `KIE_API_KEY`, no adapter, no task table, no callback route. | `lib/env.ts` |
| 8 | **No digital wallpapers.** `content/digital-products.json` holds 3 PDF/printable items delivered by outbound Gumroad links — not secure paid downloads. | `content/digital-products.json` |
| 9 | **No TikTok Shop integration** in either authorized-seller or curated-external mode. `tiktokShopUrl` is `"TODO"` on every product. | `content/products.json` |
| 10 | **Admin is read-mostly.** Four tabs (Contacts/Orders/Analytics/Email). No product editor, no category editor, no 3D asset upload, no readiness report. | `app/admin/page.tsx` |
| 11 | **No database.** Flat JSON means the admin cannot create a product without a code deploy — which the brief explicitly forbids for normal products. | `content/` |
| 12 | **No test suite.** No test runner in `package.json`; `npm run lint` is the only check besides the build. | `package.json` |
| 13 | **Logo mark asset missing.** `components/logo-mark.tsx` references `/images/logo-mark-dark.png`, which has never been committed to any branch. The component self-hides, so the header is correct but bare. | `public/images/` holds 17 SVGs, no PNGs |

## What is unsafe or risky

| Severity | Issue |
| --- | --- |
| **High** | **`trailingSlash: true` + Stripe webhooks.** Next.js 308-redirects `/api/webhook` → `/api/webhook/`, and **Stripe does not follow redirects on webhook delivery**. The endpoint registered in the Stripe dashboard must be `https://interiorcleanse.com/api/webhook/` with the trailing slash, or every event silently fails. |
| **High** | **Six products, zero Price IDs.** Any "Add to cart → checkout" journey dead-ends at a 409. This is the single largest launch blocker. |
| **Medium** | **`out/` is committed to the working tree** — a stale static-export artifact from before `output: 'export'` was removed. It is dead weight and can confuse deploys. |
| **Medium** | **No rate limiting** on `/api/subscribe`, `/api/checkout`, or `/api/send-ai-email`. The last one spends Anthropic tokens per call. |
| **Medium** | **No `robots.txt` / `sitemap.xml`** — the brief requires both. |
| **Low** | **Google Fonts imported via CSS `@import`** at the top of `globals.css`, which is render-blocking and bypasses `next/font` optimization. |
| **Low** | `Product.channels.amazonUrl` etc. hold the literal string `"TODO"`, guarded by `validUrl()`. It works, but it is a sentinel where a nullable field belongs. |

## What must be preserved

Do not regress any of these while implementing:

1. `app/api/checkout/route.ts` server-side Price ID resolution — never accept a client price.
2. `app/api/webhook/route.ts` raw-body signature verification and its three isolated steps.
3. `lib/admin-auth.ts` HMAC session tokens + `middleware.ts` matcher.
4. `components/3d/` — `ProductStage`, `ProductGeometry`, `HeroScene`,
   `ScrollGallery`, `StudioEnvironment`, `BabylonViewer`. The lighting values in
   `ProductStage` are tuned (bloom threshold 0.85, exposure 0.98) to stop the
   candle blowing out to a white blob. Do not "improve" them blind.
5. The brand tokens at the top of `app/globals.css`.
6. `lib/env.ts` fail-at-call-time posture.
7. The `<em>` element inside `.wordmark` — `.wordmark em` is what colours the
   brass diamond. Swapping it for a `<span>` silently loses the accent.

## Fastest sequence to a polished launch

Ordered by value-per-hour, blockers first.

1. **Unblock revenue.** Owner runs `npm run stripe:setup -- --apply` to mint
   Products/Prices and write the IDs into `content/products.json`; register the
   webhook at the **trailing-slash** URL. Nothing else matters until this is done.
2. **Render-mode data model + `ProductExperience`.** One reusable component,
   three modes, driven by product data — so products upgrade from depth → 360 →
   true 3D with a content edit, not a deploy. *(Checkpoint 2 — started, see below.)*
3. **Dimensional product cards** using Mode C only. Zero WebGL per card;
   pointer/focus/touch parity. Immediate visible lift across the whole store.
4. **Category routes + filters** off the existing flat `/shop`.
5. **Unified commerce fields** (`sourceType`, `checkoutMode`,
   `externalPurchaseUrl`) so Amazon books and TikTok items stop pretending to be
   internal-cart products.
6. **SEO floor** — `sitemap.ts`, `robots.ts`, canonical URLs, OG images.
7. **Database migration.** Required before the admin product studio, the AI
   studio, or secure digital delivery can exist. This is the largest single
   piece of remaining work and everything in Checkpoints 5–7 depends on it.
8. Kie.ai pipeline, AI studio, admin product studio, TikTok/Printify sync.

## Honest scope note

Checkpoints 5, 6, and 7 (real catalog sync, Kie.ai, AI studio, admin product
studio, secure digital delivery) cannot be completed against flat JSON files and
cannot be verified without provider credentials. They require, at minimum: a
database, a storage bucket, and authorized API keys for Printful, Printify,
TikTok Shop, and Kie.ai. Adapters can be written and tested against fixtures
before those exist — that work is specified in `COMMERCE_INTEGRATIONS.md` and
`KIE_ASSET_PIPELINE.md` — but the checkpoints are not closable without them.
