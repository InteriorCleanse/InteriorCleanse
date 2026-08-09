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

## Planned

| Checkpoint | Tables |
| --- | --- |
| 2 | `stores`, `products`, `product_variants`, `product_costs`, `orders`, `order_items`, `refunds`, `customers`, `expenses`, `overhead_rules`, `exchange_rates`, `daily_business_metrics` |
| 4 | `assistant_threads`, `assistant_messages`, `assistant_tool_runs`, `action_approvals` |
| 5 | `integration_connections`, `integration_sync_runs`, `ad_accounts`, `campaigns`, `ad_groups`, `ads`, `ad_daily_metrics`, `attribution_mappings`, `calendar_connections`, `calendar_events`, `notification_*` |
| 6 | `subscriptions`, `plan_entitlements`, `usage_events`, `feature_flags`, `referral_codes`, `referral_events`, `support_notes` |

Every planned tenant table carries `organization_id` and gets RLS in the same
migration that creates it — never a follow-up.
