# InteriorCleanse

A Next.js storefront and author site — *For Mind, Home, Body & Spirit*.
Dark editorial design, real-time 3D product viewers, Stripe checkout with
Printful auto-fulfilment, a Brevo CRM, and Claude-authored lifecycle email.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you need; see VERCEL_ENV_SETUP.md
npm run dev
```

## Build

```bash
npm run build
```

The site needs a Node runtime — it has API routes, middleware, and a Stripe
webhook. `output: 'export'` was removed because a static export cannot contain
any of those. Hosting is Vercel; see `VERCEL_ENV_SETUP.md`.

Integrations are read lazily at request time, so the build succeeds without any
credentials. A feature whose key is missing reports that in the UI instead of
failing the build.

## The stack

| Library | What it does here |
| --- | --- |
| `three` + `@react-three/fiber` + `drei` | Hero scene, scroll gallery, product viewers |
| `@react-three/postprocessing` | Bloom + vignette grading on every WebGL scene |
| `@babylonjs/core` | The Spirit page orb — code-split to that route only |
| `gsap` + ScrollTrigger | Headline reveals, grid stagger, hero parallax |
| `lenis` | Site-wide weighted smooth scrolling |
| `framer-motion` | Cross-route page transitions |
| `@lottiefiles/dotlottie-react` | Track icons, trust strip, email capture |
| `@rive-app/react-canvas` | Optional interactive vector animations (see below) |
| `stripe` | Checkout sessions and webhook verification |
| `@anthropic-ai/sdk` | Lifecycle email generation (`claude-sonnet-5`) |
| `swr` + `recharts` | Admin dashboard data and charts |

Every WebGL scene loads through a client wrapper with `ssr: false`
(`components/3d/*Loader.tsx`) — Server Components cannot pass that flag to
`next/dynamic` themselves.

### 3D lighting

Scenes light themselves with `<StudioEnvironment>`, a rig of drei
`Lightformer` planes rendered into the environment map. This deliberately
avoids drei's `Environment preset=`, which downloads a multi-megabyte `.hdr`
from a third-party CDN at runtime.

### Lottie icons

The six icons in `public/animations/` are generated, not downloaded:

```bash
npm run build:lottie
```

Edit `scripts/build-lottie.js` to change a colour or shape. Because they are
authored here, there is no CDN dependency and no third-party licence to track.

Note: the dotLottie player fetches its WASM renderer at runtime. If that
request fails, `<LottieIcon>` falls back to the ◇ mark rather than a blank gap.

### Rive (optional, not yet wired to assets)

`components/RiveAnimation.tsx` is ready but **no `.riv` files ship with the
repo** — Rive files are binary and must be exported by hand. Save one to
`public/rive/` and render `<RiveAnimation src="/rive/candle.riv" />`. Until a
file exists at that path the component renders its `fallback` prop.

## Commerce and automation

| Route | Does |
| --- | --- |
| `POST /api/checkout/` | Creates a Stripe Checkout Session from the cart |
| `POST /api/webhook/` | On payment: places the Printful order, syncs the customer to Brevo, sends the Claude post-purchase email |
| `POST /api/subscribe/` | Adds a contact to Brevo (tagged with UTM source) and sends the AI welcome email |
| `POST /api/send-ai-email/` | Admin-only. `preview: true` generates without sending |
| `GET /api/printful/sync/` | Printful catalogue, mapped to the site's Product shape |
| `GET /api/printify/sync/` | Printify catalogue, same shape |
| `GET /api/admin/contacts/`, `/orders/`, `/analytics/` | Dashboard data — all behind the admin cookie |

**The trailing slashes are required.** `trailingSlash: true` means the
slash-less URL answers `308`, and Stripe does not follow redirects on webhook
delivery — it records the 308 as a failed attempt.

The webhook reads the raw request body: signature verification hashes the exact
bytes Stripe sent, so any parse-and-reserialize breaks every check. It answers
`200` once the signature verifies even if a downstream step failed, because a
non-2xx makes Stripe redeliver and re-place the Printful order; per-step
failures come back as `{"failures": [...]}`.

### Admin dashboard

`/admin` — contacts, orders, analytics, and a Claude email composer. Gated by
`ADMIN_PASSWORD`, with an HMAC-signed session cookie keyed on
`ADMIN_SESSION_SECRET`. `middleware.ts` verifies the signature and each admin
route re-checks it, so the dashboard is never the only guard.

### Stripe products and prices

Checkout uses Stripe **Price IDs**, resolved server-side from
`content/products.json` by slug. The browser sends only slugs and quantities,
so nothing it sends can change what a customer is charged; a product without a
`stripePriceId` returns `409` rather than falling back to a guessed amount.

```bash
npm run stripe:setup                      # dry run
npm run stripe:setup -- --apply           # create Products + Prices, write IDs back
npm run stripe:setup -- --apply --webhook # also create the webhook, print its secret
```

Idempotent — Products are tagged `metadata.ic_slug` and re-runs adopt what
already exists. Needs your own `STRIPE_SECRET_KEY`; start with an `sk_test_`
key. See `VERCEL_ENV_SETUP.md`.

### Syncing the catalogue

```bash
npm run sync
```

Writes `content/products.json` from Printful and Printify, deduplicated by slug
and preserving hand-written `tagline`, `description`, and `careNotes`. Runs
locally by design — a serverless filesystem is read-only, so a route that wrote
the file would lose the change on the next deploy.

## Add a product

Edit `content/products.json`. Required: `slug`, `name`, `category`, `tagline`,
`description`, `price`, `heroImage`, `gallery`, `viewer`, `channels`,
`featured`, `comingSoon`. Optional: `materialColor` (the 3D viewer's base
colour), `badge`, `careNotes`.

`category` must be one of `candle`, `print`, `tote`, `mug`, `cleaning`, `book`,
`custom` — each maps to real geometry in `components/3d/ProductGeometry.tsx`.

## Add a book

Edit `content/books.json`. Required: `slug`, `title`, `coverImage`, `imageAlt`,
`hook`, `bullets`, `paperbackUrl`, `kindleUrl`, `featured`. Optional: `track`
(`mind` | `health` | `home`).

Faith-library titles live in `spiritBooks` in `lib/content.ts`. Digital
downloads live in `content/digital-products.json`.

## Environment variables

See `VERCEL_ENV_SETUP.md` for where to find every key and how to configure the
Stripe webhook. Copy `.env.example` to `.env.local` for local work.

## Deployment

Vercel. Import the repo, add the environment variables, deploy — Vercel builds
on every push.

`.github/workflows/ci.yml` runs `npm run lint` and `npm run build` so a broken
build is caught before it ships. The GitHub Pages workflow was removed along
with `output: 'export'`.

### Custom domain

In Vercel → **Settings → Domains**, add `interiorcleanse.com` and set the
A/CNAME records Vercel shows you. These replace the GitHub Pages DNS records;
`public/CNAME` has been removed.

## Launch notes

See `CONTENT_CHECKLIST.md` and the checklist at the end of
`VERCEL_ENV_SETUP.md` for what still needs doing outside the code.
