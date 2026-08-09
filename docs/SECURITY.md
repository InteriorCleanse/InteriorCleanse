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

## Audit log

`audit_logs` has no UPDATE or DELETE policy for anyone, including platform
owners — append-only from the application's perspective.

## Open items before production

These are known and deliberately not done yet. None should be assumed handled.

- [ ] Third-party security review
- [ ] Credential vault for tenant integration keys (Checkpoint 5): envelope
      encryption, a real KMS rather than one static key, and a rotation plan.
      A single never-rotated master key is a single point of total compromise.
- [ ] Rate limiting and abuse monitoring on auth and assistant endpoints
- [ ] GDPR/DPA paperwork, data export, and deletion workflows
- [ ] Prompt-injection defences on connector-sourced text (Checkpoint 4)
- [ ] Real privacy policy and terms (current pages are placeholders)
- [ ] Backup and restore rehearsal
- [ ] SOC 2, if enterprise customers are ever targeted
