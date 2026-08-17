# Data model

Implemented tables are in `supabase/migrations/`. Planned tables are listed with
the checkpoint that introduces them.

## Implemented — Checkpoint 1

| Table | Purpose | Isolation |
| --- | --- | --- |
| `profiles` | Product-facing identity, one row per `auth.users` | Self + co-members + platform staff |
| `organizations` | The tenant | Members only |
| `organization_members` | User ↔ org ↔ role | Members of that org |
| `platform_staff` | Vendor operators | Staff read only; no write policy exists |
| `platform_owner_allowlist` | Emails allowed to claim ownership once | Service role only |
| `audit_logs` | Attributable record of sensitive events | Org admins + staff; append-only |

### Enums

- `platform_role` — `platform_owner`, `platform_admin`, `platform_support`
- `tenant_role` — `tenant_owner`, `tenant_admin`, `analyst`, `member`, `viewer`
- `member_status` — `active`, `invited`, `suspended`

### Invariants enforced in the database

- A profile row is created by trigger on `auth.users` insert. Doing it in
  application code leaves a window where an authenticated user has no profile
  and every policy denies them.
- The creator of an organization becomes its `tenant_owner` in the same
  transaction, so a failed second statement cannot orphan a workspace.
- An organization always retains at least one active owner. Enforced by a
  trigger, since the rule spans rows and a CHECK constraint cannot express it.
- Slugs are generated server-side; a client-supplied slug is a collision vector.

## Implemented — Checkpoint 4

| Table | Purpose | Isolation |
| --- | --- | --- |
| `assistant_threads` | One conversation | Members; renamable by its author or an admin |
| `assistant_messages` | Turns, citations, token usage | Members; append-only (no UPDATE/DELETE policy) |
| `assistant_tool_runs` | Every tool call, its status and duration | Members; append-only |
| `action_approvals` | The gate every write passes through | Members; decided only via `decide_action_approval()` |
| `goals` | What a proposed goal becomes once approved | Read by members, written by admins |
| `notification_rules` | What a proposed alert becomes once approved | Read by members, written by admins |

### Invariants enforced in the database

- `action_approvals` carries `arguments_hash` — a SHA-256 of the canonicalised
  arguments — and a partial unique index on
  `(requested_for, tool_name, arguments_hash) where state in ('pending','approved')`.
  Proposing the same thing twice reuses the grant instead of minting a parallel
  one, and a changed argument produces a different hash, so "if the arguments
  change, require a new approval" is enforced rather than intended.
- Deciding an approval goes through `decide_action_approval()`, not an UPDATE
  policy: only the named person, only while pending, only before expiry, always
  audited. Those rules span rows and time and cannot be written as a predicate.
- `mark_approval_executed()` transitions `approved → executed` and returns
  whether it won, which is how a double-submitted approval executes once.
- Assistant transcripts have no UPDATE or DELETE policy, so a conversation
  cannot be quietly rewritten after the fact.

## Implemented — Checkpoint 5

| Table | Purpose | Isolation |
| --- | --- | --- |
| `integration_connections` | One per workspace per provider | Analysts read, admins write |
| `integration_credentials` | Sealed secrets and masked hints | **No policies at all** — service role only |
| `integration_sync_runs` | Every sync attempt and its window | Analysts and staff read |
| `notifications` | What fired, with its evidence | Members; own + workspace-wide |
| `notification_preferences` | Channels, severity floor, quiet hours | The person it belongs to |
| `notification_deliveries` | Sent, failed or suppressed, and why | Self + admins; append-only |
| `calendar_connections` | Google/Outlook links | The person it belongs to |
| `calendar_events` | Events, generated or synced | Members read |
| `calendar_feed_tokens` | Hashed, revocable subscription tokens | The person it belongs to |

### Invariants enforced in the database

- `integration_credentials` has RLS enabled and forced with **no policy**, so
  the table is unreachable from any user session — a workspace owner's, a
  platform owner's, or a compromised JWT's. That omission is deliberate and is
  the strongest statement in the schema.
- `notifications` has a unique index on `(organization_id, dedupe_key)`, so a
  re-run of the evaluator is a no-op rather than a duplicate alert.
- `notifications` has no INSERT policy: alerts are raised by the evaluator
  through the service role, never by a client claiming something happened.
  Marking one read goes through `mark_notification_read()`, which touches only
  the timestamp — the UPDATE policy alone would allow rewriting the evidence.
- `notification_deliveries` has no write policy of any kind. "Did we actually
  send that?" must have an answer nobody can quietly change.

## Planned

| Checkpoint | Tables |
| --- | --- |
| 2 | `stores`, `products`, `product_variants`, `product_costs`, `orders`, `order_items`, `refunds`, `customers`, `expenses`, `overhead_rules`, `exchange_rates`, `daily_business_metrics` |
| 5 (remaining) | `ad_accounts`, `campaigns`, `ad_groups`, `ads`, `ad_daily_metrics`, `attribution_mappings` |
| 6 | `subscriptions`, `plan_entitlements`, `usage_events`, `feature_flags`, `referral_codes`, `referral_events`, `support_notes` |

Every planned tenant table carries `organization_id` and gets RLS in the same
migration that creates it — never a follow-up.
