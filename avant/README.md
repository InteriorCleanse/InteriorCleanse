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
npm test                      # 61 unit and database tests
(cd services/vault && npm test)
```

Preview mode needs no keys: sample fleet, simulated licence checks, no
charges, and a banner that says so. Without `DATABASE_URL` it runs an
embedded Postgres (PGlite) in `.data/`, so accounts, listings, bookings and
messages all work locally with nothing to install.

## What's inside

| Area | Files |
| --- | --- |
| Pages | `app/` — home (greeting, category chips, rails: delivered, monthly, airports, nearby, cities), search with live price map, car (host photo gallery), one-page checkout, favorites, trips (upcoming, hosting, past), inbox (messages and notifications), more, sign in, Driver Pass, coverage, host (estimator, seven-step listing wizard, your listings), profile, trust & safety, concierge |
| Marketplace backend | `lib/server/` — Postgres schema and migrations, accounts and sessions, photo storage, listings, bookings with per-car locking, message threads, notifications, favorites. Tests in `lib/server/__tests__/` |
| Brand | `docs/BRAND.md` |
| Host listing rules | `lib/listing.ts` (VIN check digit, vehicle age and mileage limits, recall attestation) |
| Pricing, coverage, age rules | `lib/pricing.ts`, `lib/catalog.ts`, `lib/eligibility.ts`, `lib/checkout.ts` |
| AI concierge | `lib/ai/` (Claude with read-only tools; rules-based fallback) |
| Security | `lib/security/`, `middleware.ts`, `SECURITY.md` |
| Licence verification | `lib/verification/`, `app/api/verify/` |
| Privacy vault | `services/vault/` (Cloudflare Workers or self-hosted open-compute) |
| Photos | Only the host's own photos of the actual car (six required angles, re-encoded on the device to strip location data, checked again on the server, stored in Postgres and served from `/api/photos/<id>`). No stock, generated or illustrative car photos anywhere. Sample listings have no photos and are labelled |

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
