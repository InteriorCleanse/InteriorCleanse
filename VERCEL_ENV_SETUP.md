# Environment setup

Every key below goes into **Vercel → your project → Settings → Environment
Variables**, then **Deployments → ⋯ → Redeploy** (Vercel does not pick up new
variables until you redeploy).

For local development, copy `.env.example` to `.env.local` and fill in the
same values. `.env.local` is gitignored — never commit real keys.

> ⚠️ **This site can no longer be hosted on GitHub Pages.** Pages serves static
> files only, and the checkout, webhook, admin dashboard, and email engine all
> need a server. See *Deploying* at the bottom.

---

## Where to find each key

### Stripe

`dashboard.stripe.com` → **Developers → API keys**

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | "Secret key" — starts `sk_live_` (or `sk_test_` while testing) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | "Publishable key" — starts `pk_live_` |
| `STRIPE_WEBHOOK_SECRET` | From the webhook you create below — starts `whsec_` |

Reveal the secret key once and store it in a password manager; Stripe will not
show it again.

### Printful

`printful.com` → **Settings → Stores → API** → *Add API token*. Give it read
access to Products and write access to Orders.

| Variable | Value |
| --- | --- |
| `PRINTFUL_API_KEY` | The generated token |
| `PRINTFUL_STORE_ID` | Settings → Stores → the numeric ID beside your store |

### Printify

`printify.com` → **My Profile → Connections → Generate token**.

| Variable | Value |
| --- | --- |
| `PRINTIFY_API_KEY` | The generated token |
| `PRINTIFY_SHOP_ID` | `GET https://api.printify.com/v1/shops.json` with that token returns your shop `id` |

### Brevo

`app.brevo.com` → **SMTP & API → API Keys → Generate a new API key**.

| Variable | Value |
| --- | --- |
| `BREVO_API_KEY` | The generated key |
| `BREVO_LIST_SUBSCRIBERS` | Contacts → Lists → the numeric ID of your newsletter list |
| `BREVO_LIST_CUSTOMERS` | Contacts → Lists → the numeric ID of your customers list |

Create the two lists first if they don't exist — the IDs are shown in the list
URL and in the list table.

**Also required:** verify `hello@interiorcleanse.com` as a sender under
**Senders, Domains & Dedicated IPs**, and add Brevo's DKIM/SPF records to your
DNS. Until the domain is authenticated, Brevo will reject sends from that
address and every lifecycle email fails.

### Anthropic

`console.claude.com` → **API Keys → Create key**.

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Starts `sk-ant-` |

Emails are generated with `claude-sonnet-5`. Add credit under **Billing** —
without a balance the key authenticates but every request fails.

### Admin dashboard

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD` | Whatever you choose — this is the only credential for `/admin` |
| `ADMIN_SESSION_SECRET` | Run `openssl rand -hex 32` and paste the result |

`ADMIN_SESSION_SECRET` signs the login cookie. Changing it signs everyone out.
It must be set, or `/admin` returns a 500 rather than letting anyone in.

### Site

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://interiorcleanse.com` — used for Stripe redirect URLs and email CTA links |
| `NEXT_PUBLIC_GUMROAD_STORE` | Your Gumroad subdomain, e.g. `interiorcleanse` |

---

## Creating the Stripe products, prices, and webhook

`npm run stripe:setup` does all of this for you. It needs `STRIPE_SECRET_KEY`
locally — that key is yours, so this step runs on your machine, not on the
server and not by anyone else.

```bash
echo "STRIPE_SECRET_KEY=sk_test_..." >> .env.local

npm run stripe:setup                      # dry run — lists what it would do
npm run stripe:setup -- --apply           # create Products + Prices
npm run stripe:setup -- --apply --webhook # also create the webhook endpoint
```

What it does:

1. Lists the products already in your Stripe account.
2. Creates a Product + Price for every priced item in `content/products.json`
   that doesn't exist yet, tagging each with `metadata.ic_slug`.
3. Writes the resulting `price_…` IDs back into `content/products.json` under
   `channels.stripePriceId`. **Commit that diff** — checkout reads those IDs.
4. With `--webhook`, creates the endpoint and prints the signing secret.

It is idempotent: it matches on `ic_slug` first, so re-running adopts what
already exists instead of creating duplicates. Prices are immutable in Stripe,
so changing an amount creates a new Price and leaves the old one in place.

**Start in test mode.** Use an `sk_test_` key, run a test purchase end to end,
then repeat with `sk_live_`. Products and prices do not carry across modes.

Until a product has a `stripePriceId`, checkout returns `409` and refuses to
sell it rather than inventing an amount.

### Configuring the webhook by hand

Skip this if you used `--webhook` above.

1. `dashboard.stripe.com` → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL** — note the trailing slash, it is required:

   ```
   https://interiorcleanse.com/api/webhook/
   ```

   The site runs with `trailingSlash: true`, so the URL without the slash
   answers `308 Permanent Redirect`. Stripe does not follow redirects on
   webhook delivery — it records the 308 as a failed attempt, and no Printful
   order is ever placed.

3. **Events to send** — select `checkout.session.completed`. That is the only
   event handled; adding others just creates noise.
4. Click **Add endpoint**, then reveal **Signing secret** and paste it into
   Vercel as `STRIPE_WEBHOOK_SECRET`.
5. **Redeploy**, then use **Send test webhook** in Stripe to confirm a `200`.

The handler always answers `200` once the signature verifies, even if a
downstream step failed — a non-2xx makes Stripe redeliver, which would place
the Printful order a second time. Per-step failures come back in the response
body as `{"failures": [...]}` and are logged in Vercel → Logs.

### Stripe Tax

Checkout is created with `automatic_tax: { enabled: true }`. Stripe rejects the
session unless Tax is switched on: **Settings → Tax**, set your origin address,
and register the jurisdictions you collect in. If you would rather not use it
yet, set `automatic_tax` to `{ enabled: false }` in
`app/api/checkout/route.ts`.

---

## Syncing products

Run locally, not on the server — a serverless filesystem is read-only, so a
route that wrote `content/products.json` would lose the change on next deploy.

```bash
npm run sync     # pulls Printful + Printify into content/products.json
git diff         # review — fill in blank taglines and descriptions
git commit -am "chore: sync product catalogue"
```

Existing hand-written `tagline`, `description`, and `careNotes` are preserved;
the providers have no equivalent field and would otherwise blank them.

`/api/printful/sync/` and `/api/printify/sync/` return the same mapped JSON
read-only, for inspecting what the providers currently expose.

---

## What still needs doing outside the code

- [ ] **Verify the Brevo sender domain** (DKIM + SPF) — lifecycle email cannot
      send until this is done.
- [ ] **Enable Stripe Tax**, or disable `automatic_tax` in the checkout route.
- [ ] **Point DNS at Vercel** — in Vercel → Settings → Domains, add
      `interiorcleanse.com`, then set the A/CNAME records Vercel shows you.
      These replace the GitHub Pages records.
- [ ] **Create the Gumroad products** for `content/digital-products.json` and
      confirm each `gumroadPath` matches the real product URL.
- [ ] **Replace the `"TODO"` channel URLs** in `content/products.json` with
      real Amazon/Etsy/TikTok listing links.
- [ ] **Put a rate limiter in front of `/api/subscribe/`.** The in-process
      counter there resets on every cold start, so it slows a naive script but
      does not stop a distributed one — and each call that gets through spends
      Claude tokens and a Brevo send. Vercel WAF rate limiting or an Upstash
      counter both work.
- [ ] **Run `npm run stripe:setup -- --apply`** so every product has a
      `stripePriceId`. Checkout returns 409 for anything that doesn't.
- [ ] **Have the legal pages reviewed** — privacy policy and terms are drafts.

---

## Deploying

The repository previously deployed to GitHub Pages via
`.github/workflows/deploy.yml`. That path is gone: `output: 'export'` was
removed from `next.config.js` because static export cannot contain API routes,
middleware, or a webhook handler.

To deploy:

1. Import the repository at `vercel.com/new`.
2. Framework preset: **Next.js**. No build-command override is needed.
3. Add every variable above, for **Production** (and **Preview** if you use it).
4. Deploy, then add the custom domain under **Settings → Domains**.

The remaining workflow (`.github/workflows/ci.yml`) runs `npm run build` and
`npm run lint` on pushes, so a broken build is caught before Vercel deploys it.
