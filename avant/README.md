# AVANT

Peer-to-peer car sharing, built to be easier and fairer than the incumbent:
the whole price on every card and map pin, insurance as one number, a licence
check you do once, young drivers welcomed with a capped fee, a 24/7 AI
concierge, and personal data kept to the minimum and encrypted.

This folder is a complete, standalone app. It lives here because this
session could not create a new repository; move it to its own repo with
`git subtree split --prefix avant -b avant` and push that branch.

## Run it

```bash
npm install
cp .env.example .env.local    # everything optional; empty = preview mode
npm run dev                   # http://localhost:3000
npm test                      # 30 unit tests
(cd services/vault && npm test)
```

Preview mode needs no keys: sample fleet, simulated licence checks, no
charges, and a banner that says so.

## What's inside

| Area | Files |
| --- | --- |
| Pages | `app/` — home, search with live price map, car, one-page checkout, Driver Pass, coverage, trips, host (estimator, five-step listing wizard, my listings), account, trust & safety, concierge |
| Host listing rules | `lib/listing.ts` (VIN check digit, vehicle age and mileage limits, recall attestation) |
| Pricing, coverage, age rules | `lib/pricing.ts`, `lib/catalog.ts`, `lib/eligibility.ts`, `lib/checkout.ts` |
| AI concierge | `lib/ai/` (Claude with read-only tools; rules-based fallback) |
| Security | `lib/security/`, `middleware.ts`, `SECURITY.md` |
| Licence verification | `lib/verification/`, `app/api/verify/` |
| Privacy vault | `services/vault/` (Cloudflare Workers or self-hosted open-compute) |
| Imagery | AI-generated, listed in `content/asset-sources.json`, landed by the "AVANT: land assets" workflow |

## Founder docs

- `docs/INSURANCE_PLAYBOOK.md` — insurance in plain English and the order to do it in
- `docs/LEGAL_BRIEF.md` — state P2P laws, taxes, age rules, privacy, with sources
- `docs/FEATURES_VS_TURO.md` — what the incumbent does and what AVANT does better
- `docs/LAUNCH_CHECKLIST.md` — keys, vault, deployment, business

## The name

**AVANT** (from avant-garde: ahead). `driveavant.com` and `avant.cars` were
available when checked on 2026-09-28. A consumer-lending company already
trades as Avant, so have a trademark attorney clear it for vehicle rental
(class 39) and software (class 9/42) before filing or buying the domain.
