# GCode Keys — launch checklist

Everything needed to take the storefront from preview to taking real orders.
Code is ready; the rest is accounts, env vars, and operational setup. No real
keys ever go in the repo — they are pasted into the Vercel project.

## 1. What the code already does

- **Storefront** — build-a-fob studio, shop, VIN lookup, cart that persists
  across reloads, 4-step checkout with ownership verification.
- **Pay-on-approval flow** — checkout places a request with **no charge**;
  the operator confirms a flat price and sends a Stripe payment link.
- **Order store** — requests persist (Vercel KV; in-memory fallback for preview).
- **Operator console** (`/operator`) — password-gated; look up an order,
  prefill the amount, mint a Stripe payment link, see recent orders.
- **Stripe webhook** — signature-verified; marks orders paid and alerts dispatch.
- **Email** — customer confirmation + dispatch alerts on new order and on payment.

## 2. Accounts to create

| Service | Why | Gives you |
| --- | --- | --- |
| **Vercel** | Hosting | Project (Root Directory = `gcodekeys`) |
| **Stripe** | Payments | `STRIPE_SECRET_KEY`, webhook signing secret |
| **Vercel KV** (or Upstash) | Durable orders | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| **Resend** | Email | `RESEND_API_KEY` + a verified sending domain |
| **Domain** (gcodekeys.com) | Brand | DNS you point at Vercel |

## 3. Environment variables (set in Vercel → Project → Settings → Environment Variables)

```
STRIPE_SECRET_KEY=         # sk_live_… (use sk_test_… to rehearse first)
STRIPE_WEBHOOK_SECRET=     # from the webhook endpoint you create in step 4
NEXT_PUBLIC_SITE_URL=https://gcodekeys.com

OPERATOR_PASSWORD=         # a long random passphrase — gates /operator
OPERATOR_SESSION_SECRET=   # optional; a second random value to sign cookies

KV_REST_API_URL=           # auto-populated when you add a Vercel KV store
KV_REST_API_TOKEN=

RESEND_API_KEY=            # re_…
EMAIL_FROM=GCode Keys <hello@gcodekeys.com>   # must be a verified sender
OPERATOR_EMAIL=            # your dispatch inbox for new-order + paid alerts
```

Leave any of these blank to run that piece in preview mode (payments 501,
orders in-memory, email logged-not-sent) — nothing crashes.

## 4. Stripe webhook

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://gcodekeys.com/api/webhook/` (note the trailing slash).
3. Events: `checkout.session.completed` (and `checkout.session.expired`).
4. Copy the **Signing secret** → set it as `STRIPE_WEBHOOK_SECRET` in Vercel.

## 5. Deploy

1. Import the `InteriorCleanse/InteriorCleanse` repo into a new Vercel project.
2. **Root Directory = `gcodekeys`** (this is how a sub-folder deploys as its
   own project, like the sibling projects in this monorepo).
3. Add the env vars (step 3) and the Vercel KV store.
4. Point `gcodekeys.com` DNS at Vercel and add it as the project domain.
5. Deploy from the `claude/gcodekeys-site` branch (or merge it first).

## 6. Go-live smoke test (in Stripe **test** mode)

1. Place a request on `/checkout` → you get a reference; the request shows in
   `/operator` under **Recent orders**, and dispatch gets an email.
2. In `/operator`, look up the ref, set the confirmed amount, **create link**.
3. Open the link, pay with Stripe's `4242 4242 4242 4242` test card.
4. Land on `/paid`; the order flips to **PAID** in the console and dispatch
   gets a "schedule the cut" email.
5. Swap test keys for live keys and repeat once with a real small charge.

## 7. Operational + legal (outside the code)

These are the real-world steps that make the service legitimate — do not skip.

- **Business registration** and a business bank account for Stripe payouts.
- **Insurance** (general liability; garage-keepers if you handle vehicles).
- **Locksmith / key-cutting licensing** where your state or city requires it.
- **Ownership-verification policy** in writing (the site promises it; honor it —
  ID + registration/title name match + VIN before any key is cut).
- **Key stock & tooling**: wholesale accounts for OEM/aftermarket fobs and
  blades, a cutting machine, and programming tools (see `docs/SOURCING.md`).
- **Real flat-price table** to replace the example prices before launch.
- **Service area + dispatch phone/hours** — update the footer placeholders.
- **Dealer-only referrals**: a plan for the late-model vehicles you refer out.

## 8. Still "nice to have" after launch

- Encrypted upload + storage for the ownership documents (the checkout
  collects file names only in preview; wire secure upload before taking real
  document images).
- Operator order status transitions (schedule, complete) and notes.
- Drop-alert waitlist wired to the email provider (the `/api/notify` route is
  stubbed to validate + log today).
