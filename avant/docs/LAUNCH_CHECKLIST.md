# Launch checklist

## 1. Keys (all in the host's secret store, never in git)

| Variable | How to get it |
| --- | --- |
| `DATABASE_URL` | Any Postgres: Neon or Supabase (free tiers are fine to start), RDS, or your own. Use the pooled connection string. Migrations run on first request. **Required on Vercel**: without it the app runs in memory and forgets every account on each cold start |
| `AVANT_SESSION_SECRET`, `AVANT_ENCRYPTION_KEY`, `AVANT_VAULT_SIGNING_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, once each. **Back up `AVANT_ENCRYPTION_KEY` outside Vercel** (a password manager): messages, delivery addresses, pickup notes and VINs can't be read without it |
| `STRIPE_SECRET_KEY` | Stripe dashboard. Start with a test key. A restricted key needs Checkout Sessions (write) and Identity Verification Sessions (write, plus read of verified outputs) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint `https://<domain>/api/webhook/stripe`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`. Add `account.updated` with "Listen to events on Connected accounts" |
| Stripe Connect | Stripe → Connect → get started, platform type **Marketplace**, Express accounts, US. Hosts set up payouts from Earnings; AVANT never sees bank details. The restricted key also needs Accounts, Account Links, Transfers and Refunds (write) |
| `CRON_SECRET` | Any long random string. `vercel.json` runs `/api/cron` daily (09:17 UTC); on a Pro plan you can make it hourly |
| `RESEND_API_KEY`, `AVANT_EMAIL_FROM` | resend.com: verify your sending domain, then create a key. **Required in production**: without them new accounts skip email verification, and password reset can't work |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint `https://<domain>/api/verify/webhook`, events `identity.verification_session.*` |
| `ANTHROPIC_API_KEY` | console.anthropic.com. The concierge uses `claude-opus-5` by default (`AVANT_AI_MODEL` overrides) |
| `AVANT_VAULT_URL` | After deploying the vault (below) |
| `AVANT_REQUIRE_SECRETS=1` | Set in production so a missing secret is an error, not a demo |
| `NEXT_PUBLIC_SITE_URL` | The real `https://` domain. Required in production: links in emails and Stripe redirects are built from it, never from the request's Host header |
| `AVANT_SECURITY_CONTACT` | A `mailto:` or `https:` address for vulnerability reports, published at `/.well-known/security.txt` |
| `AVANT_SUPPORT_EMAIL` | The inbox for member reports (harassment, scams). Someone must act on them within a day: App Review checks that reporting works |
| `AVANT_HOST_TEAM_EMAIL` | Where host leads from `/host` go (falls back to the support inbox). Reply within a day |
| `AVANT_PRIVACY_CONTACT` | A `mailto:` for privacy requests, shown in the privacy notice |
| `AVANT_INSURER_NAME`, `AVANT_POLICY_NUMBER`, `AVANT_ROADSIDE_PHONE`, `AVANT_CLAIMS_PHONE`, `AVANT_CLAIMS_EMAIL` | From the insurer once the policy binds (see `INSURANCE_PLAYBOOK.md`). Every claim and incident report is emailed to the claims address |
| `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` | Push notifications for the iOS app (see `APP_STORE.md`) |
| `AVANT_TRUSTED_PROXY_HOPS` | Only off Vercel: the number of proxies in front of the app. With `AVANT_REQUIRE_SECRETS=1` the app refuses to guess |

## 2. The vault

```bash
cd services/vault
npm install
# Cloudflare:
npx wrangler d1 create avant-vault           # put the id in wrangler.toml
npx wrangler d1 execute avant-vault --file=schema.sql --remote
npx wrangler secret put SIGNING_KEY           # same value as AVANT_VAULT_SIGNING_KEY
npx wrangler deploy
# or self-hosted on your own machine with open-compute:
curl -fsSL https://open-compute.dev/install.sh | sh
ocd setup --yes
ocd wrangler deploy
```

## 3. The app

- Deploy `avant/` (Vercel: set the project root to `avant`). A project
  named `avant` was created on 2026-09-28 in the GTEnterprises team with root
  `avant`, a skip-if-unchanged build step, and random
  `AVANT_SESSION_SECRET` / `AVANT_ENCRYPTION_KEY` values. The automated
  deploy was refused for lack of permission, and the project could not be
  read back afterwards. Check the Vercel dashboard: if it is there, connect
  it to the repository and deploy the branch; if not, create it with the
  same settings. Rotate both keys before real users arrive.
- Set `NEXT_PUBLIC_SITE_URL` to the real domain.
- Set `NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0` in production so only real listings show.
- Host photos are stored in Postgres and served from the app's own origin, so no extra `img-src` is needed. Past roughly 10,000 listings, move them to object storage (S3, R2) and add its origin to `img-src` in `middleware.ts`.
- Set the email variables above: email verification, password reset and email copies of notifications use them.
- Give preview deployments their own database (or none). Never the production `DATABASE_URL`.
- Vercel → Firewall: add a rate-limit rule for `/api/auth/*` (for example 20 requests a minute per IP), and for `/api/checkout`, `/api/verify/*` and `/api/concierge`.
- Turn on Vercel's deployment protection for previews, and two-factor authentication on Vercel, GitHub, Stripe, Resend and the database provider.
- Keep `AVANT_INDEXABLE=0` until listings and legal review are real.

## 4. Marketing

- The host launch plan (segments, channels, scripts, budget, tracking) is the shared doc "AVANT host launch plan: Denver".
- Regenerate every graphic and the flyer's QR code with your domain: `SITE=https://yourdomain npm run marketing:assets` (with the app running on :3000). Outputs: `marketing/social/`, `marketing/flyer.pdf`, and the link previews in `app/`.
- Tag every link: `/host?utm_source=…&utm_medium=…&utm_campaign=founding-hosts`. Leads keep their tags in `host_leads`.

## 5. Business

- Review the AVANT Advantage amounts in `lib/circle.ts` (Circle tier fees, the
  Promise credits, the referral credits). Credit is a liability on the books:
  your accountant should see the `credits` table. Credit can't be cashed out.

- Insurance program signed (see `INSURANCE_PLAYBOOK.md`); then set
  `COVERAGE_TERMS_FINAL = true` with the carrier's numbers.
- Legal checklist done (see `LEGAL_BRIEF.md`, and the counsel checklist at its end). The terms, trip terms and Host Agreement at `/legal/terms` and `/legal/host` are drafts marked as such; when counsel finalises a document, bump its date in `lib/legal.ts` so the next acceptance is recorded against the new version.
- Real hosts list their own cars from `/host/new`. Turn the sample fleet off (`NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0`) once the first real listings are live.
