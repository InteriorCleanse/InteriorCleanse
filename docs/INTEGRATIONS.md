# Integrations

## What is built

| Connector | Credentials | Sync loop | Notes |
| --- | --- | --- | --- |
| CSV import | none | n/a by design | A file is a snapshot, not a connection. |
| Stripe | secret key, sealed | **yes** | Settled charges and refunds, fees from the expanded balance transaction. |
| Shopify | admin token, sealed | **yes** | Orders, line items and nested refunds, on `updated_at`. |
| Google / Outlook calendar | — | no | Schema and the read-only feed exist; the OAuth handshakes do not. |
| Meta Ads, Google Ads | — | no | Registry entries only, marked `planned` in the UI. |

## The sync loop

`lib/integrations/sync/` — an adapter turns one vendor's API into normalised
records for a window; everything else is shared. A new connector is a
translation problem, not a distributed-systems problem.

The decisions worth knowing, because each one is a wrong number if reversed:

- **Windows overlap by 30 minutes.** Vendors backdate objects and are eventually
  consistent, so resuming from exactly the last success loses records every
  time. Overlap is free because every write upserts on the vendor's own id.
- **The first run backfills 90 days, not all history.** Otherwise the first sync
  of an established account never finishes.
- **A run has a page budget.** When it runs out the result is `partial` and the
  watermark advances only to the newest record actually written — never to the
  window end, which would silently skip everything past the cut.
- **A failed run keeps what it wrote and holds the watermark.** Discarding
  partial data means a flaky connection has no data at all; advancing the
  watermark means the gap is never refetched.
- **Only a rejected credential marks a connection `revoked`.** Rate limits and
  vendor 5xx are `degraded`. Telling a customer to rotate a working key wastes
  their time and teaches them to ignore the badge.
- **No vendor response body ever reaches an error message or a log.** Vendor
  errors quote the offending request, and the request carries the API key.

Triggered two ways: `POST /api/integrations/sync` for a signed-in admin
("Sync now"), and `GET` on the same route with the `CRON_SECRET` header for
the scheduler, which sweeps every connection not attempted in the last 50
minutes. Neither accepts an organization id from the caller.

Tested against recorded vendor responses in `tests/fixtures/vendor-responses.ts`
— 43 assertions, no network, no keys.

### Known gaps in what the connectors can tell you

- **Stripe reports one line item per charge**, named for the charge. Stripe does
  not know what was sold. Per-product revenue needs a storefront connector, and
  inventing a product split from a payment record would be fabrication.
- **An unknown processing fee is stored as zero**, because the column cannot
  hold "unknown". That understates cost rather than inventing one, and it only
  happens when Stripe does not return the balance transaction.
- **Shopify does not report what the payment processor kept.** Connect Stripe
  as well if fees matter to your margin.

## Rules

- When keys are absent: show an honest **Not Configured** state, provide setup
  steps, keep the adapter testable via fixtures. Never display fake live success.
  `components/ui.tsx` already exports `<NotConfigured>` for this.
- OAuth: authorization code flow with PKCE where supported, validated `state` and
  redirect URI, least-privilege scopes, refresh tokens encrypted at rest and
  never returned to the client, safe rotation and revocation, consent recorded in
  `audit_logs`.
- Webhooks: signature verification, replay protection, idempotency keys,
  backoff, dead-letter handling, visible sync status.
- Credentials are **per tenant**, stored encrypted in `integration_connections`
  — never in `process.env`. This is the architectural difference between a
  single-business tool and a sellable product.

## Priority

**Phase 1** — CSV/manual import, Stripe, Shopify, Google Calendar, Microsoft
Outlook Calendar, iCalendar subscription feed.

**Phase 2** — Meta Ads, Google Ads, TikTok Ads, WooCommerce, Etsy, Amazon seller
data where permitted, QuickBooks.

## Apple Calendar — accuracy requirement

The web/PWA build provides private iCalendar subscription feeds and downloadable
events. Read-only feeds must be **labelled read-only**. Do not claim web-based
two-way iCloud sync; full device calendar read/write requires a native companion
using EventKit with explicit permission.
