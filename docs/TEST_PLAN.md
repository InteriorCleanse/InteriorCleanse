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
| `tests/sync.test.ts` | Connector adapters against recorded vendor responses, HTTP failure classification, window and watermark arithmetic | 43 passing |
| `tests/email.test.ts` | Transport failure classification, HTML escaping and link safety, every delivery outcome recorded with a reason | 22 passing |
| `tests/schedule.test.ts` | Local-time briefing windows across DST and the date line, dedupe keys, constant-time cron authorization | 20 passing |
| `tests/calendar-oauth.test.ts` | PKCE derivation, state comparison, token exchange failure classes, Graph/Google event parsing | 27 passing |
| `tests/ratelimit-distributed.test.ts` | The concurrency race an atomic store exists to fix, plus a counter-example proving the test bites | 10 passing |
| `tests/readiness.test.ts` | Severity of each deployment check, and that no key material reaches the report | 15 passing |
| `tests/workspace-data.test.ts` | Export list checked against the migrations, RFC 4180 CSV, retention windows and what must never expire | 28 passing |

Authorization is deliberately pure functions so the rules are testable without a
database. That is the point of `lib/authz.ts` existing as its own module.

## Tenant isolation, against a real Postgres

`tests/rls.integration.test.ts` — **31 assertions, passing.** This was the
longest-standing gap in the product: isolation is enforced by RLS in the
database, so no TypeScript test could ever prove it.

```bash
createdb aurelis_test
RLS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/aurelis_test npm run test:rls
```

Any Postgres 14+ will do; a Supabase project is not required.
`tests/sql/supabase-shim.sql` supplies the three things Supabase provides and a
plain cluster does not — the `auth` schema with Supabase's own `auth.uid()`, the
`anon`/`authenticated`/`service_role` roles, and the default grants on `public`.
Nothing else is faked. Each run drops the schema and replays
`supabase/migrations/*.sql` in order, so the migrations themselves are what is
under test.

Without `RLS_TEST_DATABASE_URL` the suite **skips and says so** in the vitest
output. It never passes vacuously.

### How the tests avoid proving nothing

- Assertions run as the `authenticated` role with the same JWT-claim setting
  PostgREST sets. A superuser or the service role would bypass RLS entirely and
  every assertion would pass with the policies deleted.
- A rejected `INSERT` raises 42501, but a rejected `UPDATE` or `DELETE` matches
  no rows and reports success. Those cases assert on `rowCount` and re-read the
  row, not on a thrown error.
- Three tests guard the harness itself: that `current_user` is a role without
  `BYPASSRLS`, that the service role visibly *does* bypass, and that RLS is
  enabled and forced on every tenant table.
- Verified by mutation: disabling RLS on `organizations` fails 4 tests, and
  widening its `SELECT` policy to `using (true)` fails the cross-tenant read.

### The ten original assertions, and where they live

| # | Assertion | Result |
| --- | --- | --- |
| 1 | Tenant A selecting tenant B's organization → 0 rows | passes |
| 2 | Tenant A selecting tenant B's `organization_members` → 0 rows | passes |
| 3 | A `viewer` updating their own role → refused | passes (silently, 0 rows) |
| 4 | Removing or demoting the last `tenant_owner` → refused | passes (raises 23514) |
| 5 | An ordinary user selecting `platform_staff` → 0 rows | passes |
| 6 | Any role inserting into `platform_staff` → refused | passes (raises 42501) |
| 7 | Any role updating or deleting `audit_logs` → refused | passes (0 rows) |
| 8 | `claim_platform_ownership` called twice → second raises | **amended** |
| 9 | `claim_platform_ownership` for a non-allowlisted email → raises | passes |
| 10 | Creating an organization → creator is `tenant_owner` in the same transaction | passes |

Assertion 8 as written was wrong about the product. Calling it twice *for the
same person* returns quietly, deliberately: `scripts/bootstrap-owner.mjs` is
expected to be re-runnable. What must raise is a **second, different** claimant,
even an allowlisted one — the allowlist is not a standing grant. Both are now
asserted, along with the function being unreachable by an end user at all.

Beyond the ten: cross-tenant `orders`, `integration_credentials` unreadable even
by the workspace owner whose key it is, `subscriptions` unwritable by the tenant
whose entitlements it decides, and — after `0009` let a credential belong to a
per-user calendar connection — that widening the *ownership* of a secret did not
widen access to it.

### What these tests found

**A tenant admin could delete the workspace with one PATCH.** RLS permits an
admin to update the organization row, and RLS constrains rows rather than
columns — so writing `deleted_at` directly skipped the owner-only endpoint, the
typed confirmation, the audit entry, and the destruction of stored credentials.
The same route was open to granting the workspace a plan and to clearing the
demonstration flag that stops synthetic figures being read as real. Fixed by
column grants in `0010_organization_column_privileges.sql`; five assertions now
cover it, including that renaming the workspace still works.

**`insert into organizations (...) returning id` failed for the person creating
the workspace.** `RETURNING` is projected before `AFTER ROW` triggers fire, so at
that instant the creator was not yet a member, the `SELECT` policy rejected the
row, and the statement failed. The application inserts without `RETURNING`, so
nothing was broken — but `.insert(...).select()` is the idiomatic Supabase call
and one edit away, and it would have failed in production while passing every
test we had. Fixed in `supabase/migrations/0008_workspace_creation_visibility.sql`
with an exception scoped to the founding instant and no wider: visible to the
creator only while the workspace has no membership rows at all, which stops being
true microseconds later and can never become true again.

## Planned

- Vitest for the metrics engine, with fixtures per definition in the dictionary
  (Checkpoint 2). Money math and division-by-zero get explicit cases.
- Playwright for signup → onboarding → command center, and for a tenant-switching
  isolation flow (Checkpoint 3).
- Stripe test-mode subscription lifecycle (Checkpoint 6).


## Visual verification

Unit tests cover chart *geometry*; they cannot see a clipped label or a
collision. `npm run harness` renders the real components to static HTML and
screenshots them with Playwright:

```bash
npx vitest run --config vitest.harness.config.mts   # writes /tmp/charts.html
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
