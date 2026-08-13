# Test plan

## What runs today

```bash
npm run verify   # lint → typecheck → test → build
```

| Suite | Covers | Status |
| --- | --- | --- |
| `tests/authz.test.ts` | Role escalation, platform/tenant separation, impersonation limits, `assertCan` | 12 passing |
| `tests/env.test.ts` | Owner allowlist parsing, branding overrides, configured detection | 7 passing |
| `tests/money.test.ts` | Decimal parsing without float error, currency safety, conserving allocation, explicit division by zero | 26 passing |
| `tests/metrics.test.ts` | Every dictionary definition, null-not-zero contract, provenance, allocation conservation | 20 passing |
| `tests/import.test.ts` | RFC 4180 parsing, header mapping, validation, duplicate detection, preview | 22 passing |
| `tests/demo-seed.test.ts` | Determinism, referential consistency, plausibility | 9 passing |
| `tests/demo-golden.test.ts` | Pinned demo figures so engine changes cannot silently restate them | 3 passing |
| `tests/periods.test.ts` | Preset ranges, non-overlapping comparisons, zero-baseline growth, metric-aware sentiment | 23 passing |
| `tests/charts.test.ts` | Zero-inclusive axes, tick/bound agreement, Sankey balance, waterfall chaining, bubble area scaling | 37 passing |
| `tests/palette.test.ts` | Series colours resolve to `rgb(...)`, fixed slot order, fold-to-Other conservation | 8 passing |

Authorization is deliberately pure functions so the rules are testable without a
database. That is the point of `lib/authz.ts` existing as its own module.

## What is written but not yet runnable

**RLS integration tests need a live Postgres.** They cannot run in this
environment, and the isolation guarantee is unverified until they do. This is
the single most important gap in Checkpoint 1.

Once a Supabase project exists, run migrations and assert:

1. Tenant A, authenticated, selecting tenant B's organization → 0 rows.
2. Tenant A selecting tenant B's `organization_members` → 0 rows.
3. A `viewer` attempting to update their own role → refused.
4. Removing or demoting the last `tenant_owner` → refused by trigger.
5. An ordinary user selecting `platform_staff` → 0 rows.
6. Any role attempting INSERT into `platform_staff` → refused (no policy exists).
7. Any role attempting UPDATE or DELETE on `audit_logs` → refused.
8. `claim_platform_ownership` called twice → second call raises.
9. `claim_platform_ownership` for a non-allowlisted email → raises.
10. Creating an organization → creator is `tenant_owner` in the same transaction.

Each must be executed as an authenticated end user, not the service role — the
service role bypasses RLS, so testing with it proves nothing.

## Planned

- Vitest for the metrics engine, with fixtures per definition in the dictionary
  (Checkpoint 2). Money math and division-by-zero get explicit cases.
- Playwright for signup → onboarding → command center, and for a tenant-switching
  isolation flow (Checkpoint 3).
- Connector adapters tested against recorded fixtures so they stay testable while
  unconfigured (Checkpoint 5).
- Stripe test-mode subscription lifecycle (Checkpoint 6).


## Visual verification

Unit tests cover chart *geometry*; they cannot see a clipped label or a
collision. `npm run harness` renders the real components to static HTML and
screenshots them with Playwright:

```bash
npx vitest run --config vitest.harness.config.ts   # writes /tmp/charts.html
```

Running it on the first Checkpoint 3 build caught four bugs no unit test would
have: series colours resolving to a bare RGB triplet so every chart rendered
grey, a y-axis gutter that clipped `$10,000.00` to `L0,000.00`, portfolio
labels running off the canvas, and direct labels landing on neighbouring
bubbles. The colour bug is now pinned by `tests/palette.test.ts`.

`scripts/render-assistant.test.tsx` does the same for the assistant surfaces,
compiling the project's real Tailwind config over the rendered markup
(`tailwind.harness.config.ts`) so the page verifies the product rather than a
CSS shim. Previews on that page come from the real tools, not hand-written
fixtures. It caught two defects on its first run:

- The assistant reported in a hardcoded `GBP` while every dashboard defaulted to
  the organization's `base_currency`. Fixed by threading `membership.baseCurrency`
  into the route, the briefings and all three dashboards, and pinned by a test
  asserting a briefing renders in the workspace's own currency.
- Approval cards asked people to agree to `Threshold 100000` and
  `Metric contributionProfit`. Write tools now return display-ready
  `preview.fields` — formatted money, labelled metrics — while the raw
  arguments stay untouched for hashing and execution. Pinned by three tests,
  including one asserting no machine-cased metric key ever reaches a human.
