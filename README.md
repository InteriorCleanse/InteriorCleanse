# AURELIS OS

A multi-tenant subscription business operating system: connect a business's real
data, calculate profit that can be traced back to source records, and talk to an
analyst that answers from that data.

**Status: all eight checkpoints have had their substantive work done; three
remain partly open and say exactly what is missing.** See
`docs/LAUNCH_CHECKLIST.md` for what still blocks taking real customer data, and
`docs/IMPLEMENTATION_PLAN.md` for what is done and what is next.

`AURELIS OS` and `Aurelis` are working names set by environment variables, not
hardcoded. Change `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_ASSISTANT_NAME` to
rebrand without touching code.

## Run it

```bash
npm install
cp .env.example .env.local     # fill in Supabase values
npm run dev
```

The build succeeds without any credentials — unconfigured surfaces render an
honest *Not Configured* state rather than failing or faking data.

```bash
npm run verify   # lint → typecheck → test → build
```

## Database setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the project URL, anon key, and service-role key into `.env.local`.
3. Apply the migrations in order — SQL editor, or `supabase db push` with the CLI:

   ```
   supabase/migrations/0001_identity_and_tenancy.sql
   supabase/migrations/0002_rls_and_policies.sql
   supabase/migrations/0003_owner_bootstrap.sql
   ```

Migrations are plain SQL and committed on purpose: the RLS policies are the
security model, and they should be reviewable in a pull request rather than
generated behind an ORM.

## Becoming the platform owner

There is no owner signup screen — `platform_staff` has no INSERT policy for any
role, so it cannot be written through the application.

```bash
# 1. Allowlist yourself
echo 'PLATFORM_OWNER_EMAILS=you@example.com' >> .env.local

# 2. Sign up normally at /signup

# 3. Claim ownership (once; audited; refuses if an owner already exists)
node scripts/bootstrap-owner.mjs you@example.com
```

`/owner-admin` then becomes reachable. To anyone else it redirects to the
customer app rather than returning 403 — a non-staff user should not learn the
route exists.

## How isolation works

Tenant separation is enforced by Postgres Row Level Security, not by application
code. A query that forgets its tenant filter returns nothing instead of another
customer's revenue.

Three layers, in order of authority:

1. **RLS** — the guarantee (`supabase/migrations/0002_rls_and_policies.sql`)
2. **`lib/authz.ts`** — the policy, pure and unit-tested
3. **UI** — the affordance, cosmetic only

`docs/ARCHITECTURE.md` explains why middleware authenticates but deliberately
does not authorize.

## Security

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is server-only, has no
`NEXT_PUBLIC_` prefix, and `serverEnv()` throws if it is reached from a browser
bundle. Read `docs/SECURITY.md` before deploying — the open-items list is real,
and includes a third-party review that has not happened.

## Documentation

| File | Contents |
| --- | --- |
| `docs/PRODUCT_SPEC.md` | What it is and what it must never do |
| `docs/ARCHITECTURE.md` | Stack, request lifecycle, recorded decisions |
| `docs/DATA_MODEL.md` | Tables, enums, database-enforced invariants |
| `docs/METRICS_DICTIONARY.md` | Every financial definition, fixed before implementation |
| `docs/SECURITY.md` | Threat model, isolation, secrets, open items |
| `docs/INTEGRATIONS.md` | Connector contract and priority |
| `docs/IMPLEMENTATION_PLAN.md` | Checkpoint status |
| `docs/TEST_PLAN.md` | What runs, and the RLS tests that need a live database |
| `docs/LAUNCH_CHECKLIST.md` | Honest gate list |
| `docs/reference-audit.md` | Reference material audit |
