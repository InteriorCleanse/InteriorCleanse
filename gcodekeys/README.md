# GCode Keys

Custom car keys, cut like code. A Next.js 14 storefront for building custom
fobs, buying key accessories and anti-theft gear, running limited drops, and
ordering replacement keys by VIN. **The code that cuts.**

> Preview build. All prices in the catalog are **examples** to set before
> launch, not live charges. Keys are programmed at the vehicle after proof of
> ownership. GCode Keys is an independent service, not a dealer or
> manufacturer.

## Stack

- Next.js 14 (App Router), React 18, TypeScript.
- No CSS framework; a single hand-built neon theme in `app/globals.css`.
- VIN decode via the free NHTSA vPIC API (no key).
- Stripe for payments (wired at launch; the store runs in preview mode until
  `STRIPE_SECRET_KEY` is set).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in as needed; all optional for preview
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

## Structure

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Home: hero, fob builder, shop, drops, replace-by-VIN, trust |
| `components/Storefront.tsx` | All interactive storefront UI and cart state |
| `components/MatrixRain.tsx` | Ambient matrix-rain canvas |
| `lib/catalog.ts` | Products, fob options, drops (example pricing) |
| `lib/vin.ts` | NHTSA VIN decode + key-type lookup |
| `app/api/quote/route.ts` | VIN → vehicle + example flat price |
| `app/api/checkout/route.ts` | Stripe checkout (preview until key is set) |
| `app/api/notify/route.ts` | Drop waitlist (wire to your email tool) |
| `app/operator/login/` | Themed operator-console entry |

## Deploy to Vercel

1. Create a Vercel project from this folder. In a monorepo, set the project's
   **Root Directory** to `gcodekeys`.
2. Add the domain `gcodekeys.com` (and `gcodekeys.io` / `.app` as redirects).
3. Set environment variables from `.env.example` in Project Settings:
   `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`, `OPERATOR_PASSWORD`.
   **Never commit real keys.**

## Before launch (the real wiring)

- Replace example prices in `lib/catalog.ts` and `lib/vin.ts` with the real,
  operator-set flat-price table.
- Implement `app/api/checkout/route.ts` with Stripe Checkout and build line
  items from a server-side price table.
- Add the ownership-verification step (ID, registration, VIN match) to
  checkout, per the NASTF requirements in the business plan.
- Point `app/api/notify/route.ts` at your email provider.
- Finalize operator auth (password check + signed session cookie).

Programming always happens at the vehicle. The site orders, quotes, verifies,
schedules, and customizes; it never programs a car remotely.
