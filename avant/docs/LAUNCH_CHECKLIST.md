# Launch checklist

## 1. Keys (all in the host's secret store, never in git)

| Variable | How to get it |
| --- | --- |
| `AVANT_SESSION_SECRET`, `AVANT_ENCRYPTION_KEY`, `AVANT_VAULT_SIGNING_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, once each |
| `STRIPE_SECRET_KEY` | Stripe dashboard. Start with a test key. A restricted key needs Checkout Sessions (write) and Identity Verification Sessions (write, plus read of verified outputs) |
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
- Choose where host photos are stored (object storage behind the listings service) and add its origin to `img-src` in `middleware.ts`.
- Keep `AVANT_INDEXABLE=0` until listings and legal review are real.

## 4. Business

- Insurance program signed (see `INSURANCE_PLAYBOOK.md`); then set
  `COVERAGE_TERMS_FINAL = true` with the carrier's numbers.
- Legal checklist done (see `LEGAL_BRIEF.md`).
- Replace the sample fleet (`content/fleet.json`) with real hosts' cars.
