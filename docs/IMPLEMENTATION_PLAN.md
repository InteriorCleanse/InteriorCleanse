# Implementation plan

Vertical slices. Each checkpoint ends with lint, typecheck, tests, and build
passing, and each produces something usable rather than scaffolding.

## ✅ Checkpoint 0 — Foundation

- [x] Next.js 16 App Router, TypeScript strict (`noUncheckedIndexedAccess` on)
- [x] Tailwind with a light/dark token set
- [x] ESLint flat config, Vitest, `npm run verify`
- [x] `.env.example` with placeholders only
- [x] Docs suite
- [x] Reference audit (`docs/reference-audit.md` — no ZIP supplied)

## ✅ Checkpoint 1 — Identity and tenancy

- [x] Supabase Auth, email + password via Server Actions
- [x] `profiles`, `organizations`, `organization_members`, `platform_staff`, `audit_logs`
- [x] 8 roles across two permission domains
- [x] RLS on every tenant table, default-deny, forced for table owners
- [x] Central authorization module, 19 passing unit tests
- [x] Platform owner bootstrap via env allowlist, single-claim, audited
- [x] Middleware session refresh + anonymous redirect
- [x] Workspace creation, command center shell, hidden owner console
- [ ] **RLS integration tests against a live database** — written but unrunnable
      here; see `docs/TEST_PLAN.md`. This is the one Checkpoint 1 item that is
      not verified, because it needs a real Supabase project.

## ◑ Checkpoint 2 — Data and calculations

- [x] Commerce schema: stores, products, variants, effective-dated costs,
      customers, orders, order items, refunds, expenses, overhead rules,
      exchange rates, daily rollup — each with RLS in the same migration
- [x] `import_batches` + `rollback_import_batch()` so any import is undoable
- [x] Decimal-safe money (`lib/money.ts`), integer minor units, currency-typed,
      conserving `allocate()` — 26 tests
- [x] Metrics engine implementing the dictionary literally — 20 tests
- [x] Ad-spend allocation with five models, visible confidence, and an
      unallocated bucket that always conserves spend exactly
- [x] CSV pipeline: RFC 4180 parser, header auto-mapping, validation,
      in-file duplicate detection, preview — 22 tests
- [x] Deterministic demo dataset + golden snapshot — 12 tests
- [x] `MetricCard` renders formula, sources, currency, freshness, drill-down
- [x] Command center on real computed figures; empty state refuses to fake data
- [ ] **Commit path**: writing validated rows to Postgres with the batch id.
      Needs a live database to build against meaningfully.
- [ ] Daily rollup job populating `daily_business_metrics`
- [ ] Drill-down routes (`/app/revenue`, `/app/products`) — the `drillDown`
      targets exist on every metric but the pages land in Checkpoint 3

## ◑ Checkpoint 3 — Command center

- [x] Period presets and comparison windows (`lib/periods.ts`) — 23 tests.
      Growth from a zero baseline reports "no activity", never "+100%"
- [x] Metric-aware sentiment: refund rate and CAC rising read as negative
- [x] Global filters held in the URL, so a filtered view is shareable and
      survives a reload
- [x] Chart geometry (`lib/charts/scale.ts`) — value axes always include zero;
      bounds and ticks share one step so a range crossing zero always has a
      zero gridline — 37 tests
- [x] `ChartShell`: plain-English purpose, legend past one series, and a
      keyboard-accessible table for every chart
- [x] Time series (line/area), inline SVG, server-rendered, no chart dependency
- [x] Profit Engine Sankey — refuses to draw an unbalanced engine
- [x] Cash Flow Waterfall — closing balance derived, never passed in
- [x] Product Portfolio Matrix — bubble area (not radius) proportional to revenue
- [x] Validated categorical palette (`scripts/validate_palette.js`, both modes)
- [x] Drill-downs at `/app/revenue` and `/app/products`, reading through the
      same analytics module as the tiles that link to them
- [x] Rendered and visually inspected via `vitest.harness.config.ts` +
      Playwright, which caught four layout bugs the unit tests could not
- [ ] Remaining chart modes from the spec: stacked/horizontal bar, combo,
      donut, treemap, heatmap, scatter, radar, forecast fan, and the runtime
      chart-type switcher
- [ ] Remaining custom diagrams: Campaign Funnel, Customer Lifecycle Flow,
      Goal Dependency Map, Integration Health Map
- [ ] Filters beyond date/comparison (channel, SKU, campaign, region, currency)
- [ ] PNG/CSV export and annotations

## ☐ Checkpoint 4 — Analyst

Typed tools, assistant dock, streaming, source citations, `SpeechToTextProvider`
and `TextToSpeechProvider` adapters (browser speech in development), action
approval bound to exact arguments, executive briefings, prompt-injection
resistance.

## ☐ Checkpoint 5 — Calendar, notifications, integrations

Integration registry and health; Stripe/Shopify/CSV connectors; the tenant
credential vault (envelope encryption + KMS); Google and Outlook calendar;
Apple-compatible iCalendar feed labelled read-only; notification centre,
preferences, delivery log.

## ☐ Checkpoint 6 — Billing and owner console

Database-driven plans mapped to Stripe products/prices; checkout, portal,
upgrades, cancellation, grace period; entitlement checks server-side; usage
meters; owner analytics, feature flags, audit and support tooling.

## ☐ Checkpoint 7 — Public site and growth

Marketing pages, pricing, demo, ROI calculator that guarantees nothing,
referral/affiliate, UTM capture, lifecycle hooks, share cards.

## ☐ Checkpoint 8 — Hardening and launch

Full test suite, security review, performance, accessibility, deployment
runbook, backups, monitoring, launch checklist.
