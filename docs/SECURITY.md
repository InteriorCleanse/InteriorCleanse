# Security

Status: **Checkpoint 1.** The isolation model is in place. A third-party
security review has not happened and is required before real customer data.

## Threat model in one line

The product custodies other businesses' API keys and revenue data. The two
failures that matter most are *tenant A reading tenant B's data* and *a
credential leaking*.

## Tenant isolation

Enforced in Postgres, not application code. Every tenant table carries
`organization_id`, has RLS enabled and forced, and grants access only through
`is_org_member()` / `has_org_role_at_least()`. Default-deny: with RLS on and no
matching policy, access is refused.

Membership helpers are `SECURITY DEFINER` with a locked `search_path`. This is
required, not stylistic — a policy on `organization_members` that itself selects
from `organization_members` recurses infinitely.

`FORCE ROW LEVEL SECURITY` is set on tenant tables so a connection that
authenticates as the table owner does not silently bypass every policy.

There is exactly one exception to membership-based reads, and it is worth
knowing about because exceptions are where isolation bugs live. In
`0008_workspace_creation_visibility.sql`, the creator of an organization can
read it *while it has no membership rows at all* — the instant between the row
landing and the `AFTER` trigger that makes them its owner. Without it,
`insert ... returning` fails for the person creating the workspace. The
condition stops being true microseconds later and cannot become true again: the
last-owner trigger prevents a workspace from losing its final member. It is
deliberately not "the creator can always read it", which would let a founder who
was later removed keep reading the workspace's name, plan and billing status.

**This is verified, not asserted.** `tests/rls.integration.test.ts` runs 24
isolation assertions against a real Postgres as the `authenticated` role — see
`docs/TEST_PLAN.md`. Claims in this document that are not covered there should
be read as intentions.

## Secrets

| Secret | Where it lives | Exposure |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server env only | Bypasses RLS. No `NEXT_PUBLIC_` prefix; `serverEnv()` throws in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Shipped to the browser | Safe by design — it is governed by RLS |
| Tenant integration credentials | Not yet stored (Checkpoint 5) | See "Open items" |

`.env*` is gitignored except `.env.example`, which contains only placeholders.

## Authentication

- Passwords are handled by Supabase Auth (bcrypt-family hashing); this codebase
  never stores or hashes a password itself.
- Login and signup run as Server Actions, so passwords never enter client JS.
- Login failures are deliberately generic. Distinguishing "no such account" from
  "wrong password" turns the form into an account-enumeration oracle.
- Minimum 12 characters, no composition rules — length beats symbol-stuffing,
  and composition rules push users toward predictable substitutions.
- Sign-out is POST-only. A GET sign-out is triggerable by any third-party
  `<img>` tag.
- `getUser()` is used rather than `getSession()` in middleware, because
  `getSession()` only decodes a cookie the browser could have tampered with.

## Platform ownership

There is no public owner registration. `platform_staff` has no INSERT policy for
any role, so it is writable only by the service role. The first owner is claimed
once, by an email on an environment-controlled allowlist, through
`claim_platform_ownership()` — which refuses if any owner already exists and
writes an audit entry. Re-running the bootstrap is harmless.

## Impersonation

Support impersonation is read-only by construction: `IMPERSONATION_FORBIDDEN` in
`lib/authz.ts` blocks every consequential capability regardless of role,
including for a platform owner. Covered by `tests/authz.test.ts`.

## The credential vault

A workspace hands us a live Stripe key. If it leaks, the damage is to *their*
business. The design therefore starts from what happens when things go wrong.

- **A database dump is worthless on its own.** Credentials are sealed with
  AES-256-GCM before they reach Postgres; the key that opens them is not in the
  database. A leaked backup, a read replica, or a successful SQL injection
  yields ciphertext.
- **`integration_credentials` has no RLS policies at all.** RLS is enabled and
  forced, and no policy grants anything — so the table is unreachable from any
  user session, including a workspace owner's and platform staff's. Only the
  service role touches it, from one route that does its own authorization
  first. The omission is the control.
- **One compromised key does not open everything.** Every secret gets its own
  random 256-bit data key, used once. The master key wraps data keys and never
  touches a credential.
- **A ciphertext is not portable.** Organization id, credential id and field
  name are bound in as additional authenticated data, so a row copied into
  another tenant's table fails authentication instead of decrypting. Four tests
  cover the moved-row cases specifically.
- **Rotation is cheap and safe.** `rewrapSecret()` re-wraps the small data key
  and leaves the ciphertext untouched; retired keys stay configured until
  everything is rewrapped, and dropping one early produces an error naming the
  missing key rather than silent data loss.
- **The plaintext is never returned.** After sealing, the only representation
  that leaves the server is a masked hint (`sk_live_••••4242`). There is no
  endpoint, view, or admin screen that reads a credential back.
- **The shipped provider says it is not production-grade.** `productionReady`
  is `false` on the static-key provider, and the launch checklist reads it.

## Calendar feeds

A subscription URL is a bearer credential that people paste into phone settings
and forward to assistants. So the token is stored only as a SHA-256 hash, is
revocable, and every failure — bad token, revoked token, deleted workspace —
returns the same 404 with no explanation. The endpoint exposes no write method
of any kind; read-only is structural, not a permission check.

## Billing

The webhook is the only unauthenticated endpoint that can change what a
workspace is entitled to, so it is treated accordingly: signatures verified
over the **raw bytes** (never a re-serialised object), compared in constant
time, rejected outside a five-minute window so a captured request cannot be
replayed, and every event id claimed before its effect is applied so an
at-least-once delivery becomes exactly-once. A verification failure returns 400
with no detail; a processing failure returns 500 and releases the claim so the
retry can do the work.

Entitlements are read from our own mirror of Stripe's state, never from a
client claim, and `subscriptions` has no write policy for anyone — a client
that could write it could grant itself the top plan.

## The assistant

The assistant is the one component that reads attacker-influenceable text and
also holds tools, so it is treated as hostile input end to end.

- **The tool surface is the boundary.** Nine fixed tools, no general-purpose
  capability, and no tenant-scope parameter. The worst case of a successful
  injection is a business question being asked.
- **Writes never execute on the model's say-so.** A write tool returns a
  preview; the route raises an approval bound to the user, the organization,
  the tool name, and a SHA-256 of the canonicalised arguments, with a
  ten-minute expiry. Executing re-derives that hash from the arguments about to
  be used rather than trusting a supplied one, and claims the approval exactly
  once before acting.
- **Untrusted text is wrapped and neutralised** (`lib/assistant/sanitise.ts`):
  NFKC normalisation, control and bidi stripping, zero-width-space splitting of
  injection markers, truncation, and secret redaction. This reduces noise; it
  is not what holds.
- **Errors never echo model or database text** to the caller. A failed tool
  returns a fixed sentence; Postgres exception text is mapped to plain English.
- **An approval for another tenant reads as "not approved yet"** — the same
  wording as a missing one, so a cross-tenant id is never confirmed as real.
- **Transcripts are append-only**: `assistant_messages` and
  `assistant_tool_runs` have no UPDATE or DELETE policy.

## Audit log

`audit_logs` has no UPDATE or DELETE policy for anyone, including platform
owners — append-only from the application's perspective.

## Open items before production

These are known and deliberately not done yet. None should be assumed handled.

- [ ] Third-party security review
- [ ] Wire `kmsProvider()` to a real KMS before production. The vault is built
      (envelope encryption, per-secret data keys, rotation) but the shipped
      provider holds a static key in an environment variable and reports
      `productionReady: false`. That is a single point of compromise with no
      hardware boundary and no per-unwrap audit trail.
- [ ] Rate limiting and abuse monitoring on auth and assistant endpoints
- [ ] GDPR/DPA paperwork, data export, and deletion workflows
- [ ] A distributed rate-limit store. The limiter is built and wired to the
      assistant, but the default store is in-memory and reports
      `distributed: false`; on several instances the effective limit is the
      policy times the instance count.
- [ ] Real privacy policy and terms (current pages are placeholders)
- [ ] Backup and restore rehearsal
- [ ] SOC 2, if enterprise customers are ever targeted
