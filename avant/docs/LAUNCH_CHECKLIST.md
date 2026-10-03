# Launch checklist

## 1. Keys (all in the host's secret store, never in git)

| Variable | How to get it |
| --- | --- |
| `DATABASE_URL` | Any Postgres: Neon or Supabase (free tiers are fine to start), RDS, or your own. Use the pooled connection string. Migrations run on first request. **Required on Vercel**: without it the app runs in memory and forgets every account on each cold start |
| `AVANT_SESSION_SECRET`, `AVANT_ENCRYPTION_KEY`, `AVANT_VAULT_SIGNING_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, once each |
| `STRIPE_SECRET_KEY` | Stripe dashboard. Start with a test key. A restricted key needs Checkout Sessions (write) and Identity Verification Sessions (write, plus read of verified outputs) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint `https://<domain>/api/webhook/stripe`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`. Add `account.updated` with "Listen to events on Connected accounts" |
| Stripe Connect | Stripe → Connect → get started, platform type **Marketplace**, Express accounts, US. Hosts set up payouts from Earnings; AVANT never sees bank details. The restricted key also needs Accounts, Account Links, Transfers and Refunds (write) |
| `CRON_SECRET` | Any long random string. `vercel.json` runs `/api/cron` daily (09:17 UTC); on a Pro plan you can make it hourly |
| `RESEND_API_KEY`, `AVANT_EMAIL_FROM` | resend.com: verify your sending domain, then create a key. Needed for password reset emails |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint `https://<domain>/api/verify/webhook`, events `identity.verification_session.*` |
| `ANTHROPIC_API_KEY` | console.anthropic.com. The concierge uses `claude-opus-5` by default (`AVANT_AI_MODEL` overrides) |
| `AVANT_VAULT_URL` | After deploying the vault (below) |
| `AVANT_REQUIRE_SECRETS=1` | Set in production so a missing secret is an error, not a demo |

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
- Set the email variables above: password reset and email copies of notifications use them. Still to add: verifying a new account's email address.
- Keep `AVANT_INDEXABLE=0` until listings and legal review are real.

## 4. Business

- Insurance program signed (see `INSURANCE_PLAYBOOK.md`); then set
  `COVERAGE_TERMS_FINAL = true` with the carrier's numbers.
- Legal checklist done (see `LEGAL_BRIEF.md`).
- Real hosts list their own cars from `/host/new`. Turn the sample fleet off (`NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0`) once the first real listings are live.
