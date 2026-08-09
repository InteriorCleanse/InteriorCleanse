# Test plan

## What runs today

```bash
npm run verify   # lint → typecheck → test → build
```

| Suite | Covers | Status |
| --- | --- | --- |
| `tests/authz.test.ts` | Role escalation, platform/tenant separation, impersonation limits, `assertCan` | 12 passing |
| `tests/env.test.ts` | Owner allowlist parsing, branding overrides, configured detection | 7 passing |

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
