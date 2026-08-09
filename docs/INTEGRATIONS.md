# Integrations

None are implemented yet — they arrive at Checkpoint 5. This records the
contract they must satisfy so the first one does not set a bad precedent.

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
