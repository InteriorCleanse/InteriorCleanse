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

## Implemented — Knowledge and CRM

`0012_knowledge_and_crm.sql`, `0013_notion_delivery_channel.sql`.

| Table | Purpose | Isolation |
| --- | --- | --- |
| `knowledge_documents` | Whole documents from Notion, Base44 and uploaded Markdown, with a generated `tsvector` (title weight A, body B) | Members read; members and above write, so a person can upload a note |
| `crm_deals` | The CRM pipeline mirror: the vendor's stage label verbatim, a normalised `outcome`, the vendor's probability | Members read; **no write policy** — deals arrive only through the sync runner |

### Invariants enforced in the database

- `crm_deals` is a separate table from `orders` on purpose. Pipeline is money
  that has not happened; a shared table would make "add them up" one join
  away. Nothing in the schema relates a deal to revenue.
- `crm_deals.amount_minor` is `bigint`, nullable, non-negative, with `currency`
  beside it. A deal with no amount is a fact the page must count, not a zero.
- `crm_deals.probability` is the vendor's own, checked to 0–100, and nothing
  in the database multiplies it through: a weighted total is a number nobody
  measured.
- `knowledge_documents.content` is bounded at 60,000 characters with a
  `truncated` flag, and `content_hash` lets a re-sync of an unchanged page
  write nothing. Full-text search runs through the same RLS policy as any
  other read, which the isolation suite asserts by searching across tenants
  and finding nothing.
- `notification_deliveries.channel` admits `slack` and `notion`: a briefing
  written into a Notion database is a delivery like any other, and every
  delivery leaves a row saying what happened.

## Implemented — Mail and sites

`0014_mail_connections.sql`, `0015_site_builds.sql`.

| Table | Purpose | Isolation |
| --- | --- | --- |
| `mail_connections` | A person's connected mailbox: provider, address, status, when it was last read. **No mail is stored.** | The person it belongs to, and nobody else in the workspace |
| `site_builds` | One-page sites the assistant built: the brief, the HTML (bounded), status, and where it was published | Members read; admins write, matching who can approve the action that creates one |

### Invariants enforced in the database

- `integration_credentials` gains a third owner, `mail_connection_id`, and the
  "exactly one owner" check becomes a sum of three booleans equal to one. The
  table still has no policies. The mail unique index is a full index rather
  than a partial one, so NULLs from other owners never collide and `ON
  CONFLICT` can infer it.
- `mail_connections` is own-rows only, even within a workspace: a tenant admin
  cannot read, create or delete a colleague's mailbox connection. The
  isolation suite asserts it.
- `site_builds.html` is bounded at 400,000 characters (a generated page is
  well under 60 KB), and `status` is a checked enum of `generated`,
  `published`, `failed`.

## Implemented — Agents

`0016_assistant_profiles.sql`.

| Table | Purpose | Isolation |
| --- | --- | --- |
| `assistant_profiles` | One row per workspace: the analyst's name, a one-line focus, standing orders in the operator's words, and whether it reports in to the owner's mission control | Members read; admins write; another tenant can do neither (asserted) |

A profile is configuration, not authority. The standing orders are shown to
the model beneath the product's rules, framed as the workspace's preferences,
sanitised like any other text a person typed, and bounded at 2,000 characters.
The name is letters, digits and simple punctuation — nothing that could read
as markup or a prompt delimiter.

## Planned

| Checkpoint | Tables |
| --- | --- |
| 2 | `stores`, `products`, `product_variants`, `product_costs`, `orders`, `order_items`, `refunds`, `customers`, `expenses`, `overhead_rules`, `exchange_rates`, `daily_business_metrics` |
| 5 (remaining) | `ad_accounts`, `campaigns`, `ad_groups`, `ads`, `ad_daily_metrics`, `attribution_mappings` |
| 6 | `subscriptions`, `plan_entitlements`, `usage_events`, `feature_flags`, `referral_codes`, `referral_events`, `support_notes` |

Every planned tenant table carries `organization_id` and gets RLS in the same
migration that creates it — never a follow-up.
