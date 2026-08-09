# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16, App Router, TypeScript strict | Server Components keep tenant data resolution on the server by default |
| Auth | Supabase Auth | Sessions integrate with Postgres RLS via `auth.uid()`, so one identity drives both layers |
| Database | Supabase Postgres + Row Level Security | Isolation enforced by the database, not by application discipline |
| Migrations | Plain SQL in `supabase/migrations/`, committed | Reviewable in a pull request; no ORM abstraction over the policies that matter |
| Validation | Zod at every external boundary | Form input, env vars, and later connector payloads |
| Styling | Tailwind with CSS custom properties | Themeable light/dark from one token set |
| Unit tests | Vitest | Authorization rules are pure functions and testable without a database |

### Recorded decisions

**Supabase over Prisma + NextAuth.** An earlier brief for this product specified
Prisma with NextAuth credentials and app-layer tenant checks. That was rejected
in favour of Supabase because of non-negotiable principle 7 — *multi-tenant
isolation is enforced in the database, not merely hidden in the interface*. With
app-layer checks, isolation is only as good as the least careful query anyone
ever writes; with RLS, a query that forgets its tenant filter returns nothing
instead of another customer's revenue. For a product that custodies other
businesses' API keys, that difference is the whole security story.

**Next 16 over Next 14.** The brief said Next 14. Next 14.2.35 carries two live
advisories, including unauthenticated disclosure of internal Server Function
endpoints, fixed only in a later major. The AURELIS specification does not pin a
version and asks for current stable releases, so the project starts on 16.

**Middleware authenticates; it does not authorize.** See "Authorization" below.

## Request lifecycle

```
Request
  │
  ├─ middleware.ts ────────── refresh Supabase session cookie
  │                           redirect anonymous users away from /app, /owner-admin
  │                           (no role checks — see below)
  │
  ├─ Server Component ─────── lib/session.ts resolves the session and memberships
  │                           organization id comes from memberships, never the client
  │
  ├─ lib/authz.ts ─────────── can(actor, capability) decides policy
  │
  └─ Postgres ─────────────── RLS refuses anything the policy layer missed
```

## Authorization — three layers, on purpose

1. **Row Level Security** (`supabase/migrations/0002_rls_and_policies.sql`) — the
   guarantee. Cannot be bypassed by forgetting a `WHERE` clause, because the
   anon/authenticated roles have no unfiltered path to the data.
2. **`lib/authz.ts`** — the policy. Pure functions over `(actor, capability)`,
   unit-tested, one definition per rule, identical everywhere it is called.
3. **UI** — the affordance. Hiding a button is cosmetic and never load-bearing.

### Why middleware does not check roles

Role and entitlement checks need database reads. Doing that on the Edge means
either a Prisma-style query that does not run there, or a role baked into the
JWT. A JWT claim goes stale the moment a role changes or a subscription lapses,
and the failure is silent — a demoted admin keeps admin access until their token
refreshes. Middleware therefore only authenticates. Authorization happens
per-request on the server, where the data is fresh, and RLS backstops it.

## Tenant resolution

`lib/session.ts` is the only place that answers "which organization is this
request acting on". It reads memberships from the session, and when a route
supplies an id it is treated as untrusted input: matched against the
memberships and discarded if absent. An unknown id and an unauthorized id are
handled identically so the response cannot confirm that a workspace exists.

## Service-role key

`supabaseAdmin()` bypasses RLS and exists for two jobs only: owner bootstrap,
and (from Checkpoint 6) Stripe webhook reconciliation — both cases where there
is no user session to act as. It has no `NEXT_PUBLIC_` prefix, `serverEnv()`
throws if reached from a client bundle, and every call site must authorize
first.

## Two permission domains

`platform_staff` and `organization_members` are separate tables with separate
enums. A tenant role never implies a platform capability, and `platform_staff`
has no INSERT policy for anyone — it is writable only by the service role or the
bootstrap function. This is why there is no owner signup screen.

## Provider adapters

Business logic must not be locked to a vendor. Interfaces land with the
checkpoint that first needs them: `SpeechToTextProvider` and
`TextToSpeechProvider` at Checkpoint 4, connector adapters at Checkpoint 5,
notification channels at Checkpoint 5.

## Directory layout

```
app/
  page.tsx                 public landing
  login/ signup/           credentials via Server Actions
  auth/callback|signout    session exchange, POST-only sign-out
  legal/                   privacy, terms (placeholders pending legal review)
  app/                     authenticated customer surface (force-dynamic)
  owner-admin/             platform console, hidden from non-staff
components/ui.tsx          panels, buttons, fields, NotConfigured, DemoBadge
lib/
  env.ts                   lazy validated env, public/server split
  roles.ts                 role vocabulary, mirrors the SQL enums
  authz.ts                 central authorization module (pure, tested)
  session.ts               session + tenant resolution
  supabase/                server, browser, and middleware clients
supabase/migrations/       committed SQL, including all RLS policies
scripts/bootstrap-owner.mjs  one-time platform owner claim
tests/                     Vitest unit tests
```
