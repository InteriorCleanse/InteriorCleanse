-- ============================================================================
-- AURELIS OS — Checkpoint 6: billing, entitlements, owner console
--
-- The rule here: Stripe is authoritative about money, we are authoritative
-- about access. Prices, invoices and payment state live in Stripe and are
-- mirrored — never invented — into `subscriptions`. What a plan *allows* is
-- ours, enforced server-side, and never inferred from a client claim.
-- ============================================================================

create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete'
);

-- ── Subscriptions ───────────────────────────────────────────────────────────

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null unique references public.organizations (id) on delete cascade,
  plan_key               text not null default 'free',
  status                 public.subscription_status not null default 'active',

  /* Stripe's identifiers. Nullable because a free workspace never touches
     Stripe at all — creating a customer for someone who has not paid is how
     you end up reconciling thousands of empty customers. */
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  stripe_price_id        text,

  current_period_end     timestamptz,
  cancel_at              timestamptz,
  /* When payment first failed. Starts the grace clock; cleared on recovery. */
  past_due_since         timestamptz,
  trial_ends_at          timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Every workspace has exactly one subscription row from birth, so no code path
-- has to handle "billing not set up yet" as a separate state.
create or replace function public.create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (organization_id, plan_key, status)
  values (new.id, coalesce(new.plan_key, 'free'), 'active')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_default_subscription
  after insert on public.organizations
  for each row execute function public.create_default_subscription();

-- ── Webhook idempotency ─────────────────────────────────────────────────────
-- Stripe delivers at least once, retries on any non-2xx, and can deliver out of
-- order. Recording every processed event id is what turns "at least once" into
-- "exactly once" for anything with a side effect.

create table public.stripe_events (
  id            text primary key,
  type          text not null,
  /* The subscription object's own version counter, so a late-arriving older
     event cannot overwrite newer state. */
  processed_at  timestamptz not null default now(),
  payload_digest text
);

-- ── Usage ───────────────────────────────────────────────────────────────────
-- Metered because assistant calls cost real money per request. Recorded as
-- events rather than a counter so a disputed bill can be reconstructed.

create table public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references public.profiles (id) on delete set null,
  kind            text not null check (kind in ('assistant_message', 'import', 'export', 'sync')),
  quantity        integer not null default 1,
  /* Denormalised month key so the monthly count is an index scan, not a
     date_trunc over the whole table. */
  period_month    text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index usage_events_month_idx
  on public.usage_events (organization_id, kind, period_month);

-- ── Feature flags ───────────────────────────────────────────────────────────

create table public.feature_flags (
  key             text primary key,
  description     text not null,
  /* Default for everyone. */
  enabled         boolean not null default false,
  /* Workspaces where this is forced on regardless of the default. */
  enabled_for     uuid[] not null default array[]::uuid[],
  /* 0–100. Deterministic per workspace, so a workspace does not flip between
     page loads — the hash is stable. */
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null
);

create trigger feature_flags_touch
  before update on public.feature_flags
  for each row execute function public.touch_updated_at();

-- ── Support notes ───────────────────────────────────────────────────────────

create table public.support_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_user_id  uuid references public.profiles (id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index support_notes_org_idx on public.support_notes (organization_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'subscriptions','stripe_events','usage_events','feature_flags','support_notes'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- A workspace may read its own subscription. It may not write it: subscription
-- state is whatever Stripe says, mirrored by the webhook through the service
-- role. A client that could write this could grant itself the top plan.
create policy subscriptions_select on public.subscriptions
  for select using (
    public.has_org_role_at_least(organization_id, 'tenant_admin')
    or public.is_platform_staff()
  );

-- Usage is readable by admins so a bill can be checked, and writable by nobody:
-- the meter is incremented server-side.
create policy usage_events_select on public.usage_events
  for select using (
    public.has_org_role_at_least(organization_id, 'tenant_admin')
    or public.is_platform_staff()
  );

-- Flags are world-readable within the product: knowing a flag exists is not
-- sensitive, and the alternative is every page needing a service-role call.
create policy feature_flags_select on public.feature_flags
  for select using (auth.uid() is not null);

create policy feature_flags_manage on public.feature_flags
  for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

-- Support notes are staff-only. A workspace should not read what support wrote
-- about it, and support should not be tempted to write it there if they could.
create policy support_notes_staff on public.support_notes
  for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

-- stripe_events has no policies: it is service-role only, like the vault.

-- ── Recording usage ─────────────────────────────────────────────────────────
-- A definer function so the meter can be incremented from a user session
-- without granting INSERT on a table that bills someone.

create or replace function public.record_usage(
  org uuid,
  usage_kind text,
  qty integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(org) then
    raise exception 'Not a member of that workspace' using errcode = 'insufficient_privilege';
  end if;

  insert into public.usage_events (organization_id, user_id, kind, quantity, period_month)
  values (org, auth.uid(), usage_kind, greatest(1, qty), to_char(now(), 'YYYY-MM'));
end;
$$;

revoke all on function public.record_usage(uuid, text, integer) from public, anon;
grant execute on function public.record_usage(uuid, text, integer) to authenticated;

-- ── Seeded flags ────────────────────────────────────────────────────────────

insert into public.feature_flags (key, description, enabled) values
  ('assistant_voice', 'Push-to-talk and spoken replies in the assistant dock.', true),
  ('scheduled_briefings', 'Deliver briefings on a schedule rather than on request.', false),
  ('live_connector_sync', 'Background sync for Stripe and Shopify connectors.', false)
on conflict (key) do nothing;
