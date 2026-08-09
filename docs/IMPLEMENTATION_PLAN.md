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

## ☐ Checkpoint 2 — Data and calculations

Schema for stores/products/orders/costs; CSV import wizard with mapping,
preview, validation, duplicate detection and rollback; metrics engine
implementing `docs/METRICS_DICTIONARY.md`; ad-spend allocation with a visible
rule; deterministic demo seed; data lineage from a tile back to source records.

## ☐ Checkpoint 3 — Command center

Responsive shell, KPI cards with comparison/freshness/drill-down/formula
tooltips, global filters, chart shell with type switching, the seven custom
diagrams, accessible table alternatives.

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
