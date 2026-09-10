# Integrations

## What is built

| Connector | Credentials | Sync loop | Notes |
| --- | --- | --- | --- |
| CSV import | none | n/a by design | A file is a snapshot, not a connection. |
| Stripe | secret key, sealed | **yes** | Settled charges and refunds, fees from the expanded balance transaction. |
| Shopify | admin token, sealed | **yes** | Orders, line items and nested refunds, on `updated_at`. |
| Google / Outlook calendar | refresh token, sealed | **yes**, hourly | PKCE, read-only scopes; rotated refresh tokens written back before events are fetched. |
| Notion | internal integration token, sealed | **yes**, hourly | Shared pages → searchable, citable notes. Briefings written into a database you choose — one new page each, never edited after. |
| Base44 | API key, sealed | **yes**, hourly | One entity per connection → one note per record, a field per line. |
| HubSpot | private app token, sealed | **yes**, hourly | Contacts → customers; deals → `crm_deals`, never `orders`. Free tier, free API. |
| Slack | incoming webhook URL, sealed | on notify | Warnings and critical alerts to one channel. Info never. |
| Obsidian | none | snapshot | Vault bundle out (zip, frontmatter); Markdown notes in as knowledge. No cloud API exists, and the card says so. |
| Meta Ads, Google Ads, Salesforce | — | no | Registry entries only, marked `planned` in the UI. Salesforce has no free production tier; HubSpot does. |

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

## Knowledge and CRM

`lib/knowledge/` — the assistant answered from figures alone; a business's
*decisions* live in Notion, in a vault, in a CRM. Two tables, both RLS-forced:
`knowledge_documents` (whole documents, Postgres full-text search over a
generated `tsvector`, title weighted above body) and `crm_deals` (money that
has not happened, kept structurally apart from `orders`).

The assistant gets two read tools. `search_knowledge` returns passages with a
`doc:` citation each and reminds the model that notes describe intentions, not
measurements; `query_pipeline` totals open deals per currency and never across
them, and calls it pipeline, never revenue. Both are injected by the route with
the caller's own client so RLS decides what the assistant can see — the same
rows the person could open themselves.

A `doc:` citation is a row id, which is no use on a chip. So the tool also
returns a source per document — title and link — the route forwards them with
the answer, and the dock renders the chip as the document's title, linked out
to Notion or wherever it came from. Only `http(s)` links are followed; a URL
from a connected app is third-party content and is not trusted to be one. The
system prompt carries the same distinction the tool descriptions do: a note is
what someone intended, a figure is what happened, and pipeline is neither.

The pipeline has its own page, `/app/pipeline`, and no presence on the
command centre or the revenue page. It shows open deals grouped under the
CRM's own stage labels — ordered by the vendor's probability, since the
vendor's stage order is not stored and every CRM lets a customer reorder
stages — totalled per currency, with overdue and closing-soon counts from the
expected close date and won/lost counts over the last 90 days. Probabilities
are displayed, not multiplied: a weighted total is a number nobody measured.
`lib/crm/pipeline.ts` is the pure summary the page renders and is tested on
its own.

Chunking and embeddings were considered and declined: on a few hundred pages,
ranked full-text search is cheaper, deterministic, and can show the person the
document it quoted. That trade reverses at thousands of pages, which would be
a good problem.

`lib/knowledge/sync.ts` is a sibling of the commerce runner, not a
generalisation: orders get overlapping windows because a missed one is a wrong
number; notes catch up by edit time. Content is hashed so an unchanged page is
a no-op rather than a rewrite that makes the whole base look edited today.

Notion is the one place this product writes: a new page per briefing in a
database the workspace chose, with figures as properties where the database has
matching columns and in the body regardless, so an unconfigured database still
gets a complete page and nothing is refused. Rich text is chunked at Notion's
2,000-character limit, because one over-long line fails the whole create on the
day the briefing has the most to say. Every write leaves a delivery row
(channel `notion`), so a page that never appeared is diagnosable rather than
ambiguous.

`/app/knowledge` shows what the assistant can cite — the same rows, policy and
snippets its search tool sees — because a knowledge base nobody can inspect is
one nobody can correct.

Obsidian is handled honestly. There is no cloud API — a vault is a folder —
so the connector exports a zip of Markdown with Dataview-ready frontmatter
(every briefing figure as a property) and accepts Markdown uploads as
knowledge. The store-only zip writer is forty lines in `lib/zip.ts`, checked
against the CRC-32 reference vector, rather than a dependency.

## Calendar OAuth

`lib/calendar/oauth.ts`. The parts usually got wrong, written out longhand:

- **PKCE with S256, even though we are a confidential client.** A client secret
  is not a reason to skip it: PKCE binds the code to the browser that started
  the flow, so a code intercepted from a redirect cannot be redeemed elsewhere.
  A `plain` challenge *is* the verifier and protects nothing.
- **`state` is compared against an httpOnly cookie**, in constant time, and the
  cookie is cleared on every path including the failures. An attacker can make
  a victim's browser hit our callback with the attacker's code, but cannot set
  that cookie — so "your calendar is now connected to my account" fails.
- **Nothing is exchanged before the state check passes.** A code redeemed first
  is a token we had no business holding.
- **`access_type=offline` and `prompt=consent` for Google**; `offline_access`
  for Microsoft. Without them no refresh token is issued on a reconnect and the
  connection works for an hour and then dies. If one is missing anyway, the
  callback refuses and says why rather than storing a connection that will rot.
- **Read-only scopes**: `calendar.readonly` and `Calendars.Read`. The product
  renders a read-only feed and says so.
- **Microsoft Graph times arrive without a `Z`** and with the zone in a sibling
  field. Handing that to `Date` reads it as server-local and shifts every
  meeting by the server's offset.
- Refresh tokens are sealed into `integration_credentials` like every other
  secret. Because calendar connections are per person and
  `integration_connections` is per workspace, `0009_calendar_credentials.sql`
  lets a credential row point at either owner, with a check constraint making
  "exactly one" a database rule. A second secret store would have been the
  easier change and the wrong one.

27 tests, plus two isolation assertions against a live Postgres.

## Apple Calendar — accuracy requirement

The web/PWA build provides private iCalendar subscription feeds and downloadable
events. Read-only feeds must be **labelled read-only**. Do not claim web-based
two-way iCloud sync; full device calendar read/write requires a native companion
using EventKit with explicit permission.
