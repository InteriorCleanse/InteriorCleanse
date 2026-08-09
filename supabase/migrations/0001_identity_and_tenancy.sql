-- ============================================================================
-- AURELIS OS — Checkpoint 1: identity and tenancy
--
-- Tenant isolation is enforced here, in Postgres, not in application code.
-- Every tenant-owned table carries organization_id and is protected by RLS,
-- so a forgotten WHERE clause in a route handler cannot leak another tenant's
-- rows. The application's service-role key bypasses RLS by design and is
-- therefore never sent to the browser (see docs/SECURITY.md).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────

-- Platform roles govern the vendor's own staff. Tenant roles govern a
-- customer's workspace. They are deliberately separate permission domains:
-- being a tenant_owner must never imply any platform capability.
create type public.platform_role as enum (
  'platform_owner',
  'platform_admin',
  'platform_support'
);

create type public.tenant_role as enum (
  'tenant_owner',
  'tenant_admin',
  'analyst',
  'member',
  'viewer'
);

create type public.member_status as enum ('active', 'invited', 'suspended');

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users row. Holds product-facing identity only; auth
-- credentials stay in auth.users and are never mirrored here.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  avatar_url   text,
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Product-facing user identity. One row per auth.users row.';

-- ── organizations (the tenant) ──────────────────────────────────────────────

create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) between 1 and 120),
  slug               text not null unique
                       check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  business_type      text not null default 'other'
                       check (business_type in
                         ('ecommerce','digital_products','services','content','marketplace','other')),
  base_currency      char(3) not null default 'USD',
  timezone           text not null default 'UTC',
  reporting_week_starts_on smallint not null default 1
                       check (reporting_week_starts_on between 0 and 6),

  -- Demo workspaces must be unmistakable in the UI and must never be mistaken
  -- for production numbers. Checkpoint 2 seeds them; the flag lives here so
  -- every downstream query can label its output honestly.
  is_demo            boolean not null default false,

  -- Billing lands properly in Checkpoint 6. These columns exist now so
  -- entitlement checks have somewhere authoritative to read from.
  plan_key           text not null default 'trial',
  subscription_status text not null default 'trialing'
                       check (subscription_status in
                         ('trialing','active','past_due','canceled','incomplete')),
  trial_ends_at      timestamptz,

  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

comment on column public.organizations.is_demo is
  'Demo workspaces carry synthetic data and must be labeled as such in every surface.';

create index organizations_created_by_idx on public.organizations (created_by);
create index organizations_active_idx on public.organizations (id) where deleted_at is null;

-- ── organization_members ────────────────────────────────────────────────────

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.tenant_role not null default 'member',
  status          public.member_status not null default 'active',
  invited_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A user holds exactly one role per organization.
  unique (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);
create index organization_members_org_idx on public.organization_members (organization_id);

-- Every organization must keep at least one owner. Enforced in
-- 0002_rls_and_policies.sql via a constraint trigger rather than a CHECK,
-- because the rule spans rows.

-- ── platform_staff ──────────────────────────────────────────────────────────
-- The vendor's own operators. Deliberately a separate table from
-- organization_members so no tenant-side write can ever grant platform access.

create table public.platform_staff (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  role        public.platform_role not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.platform_staff is
  'Vendor operators. Never writable by tenant users; see bootstrap in 0003.';

-- ── audit_logs ──────────────────────────────────────────────────────────────
-- Present from Checkpoint 1 because owner bootstrap and role changes are
-- exactly the events that must be attributable from day one.

create table public.audit_logs (
  id              bigserial primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  actor_user_id   uuid references public.profiles (id) on delete set null,
  action          text not null,
  target_type     text,
  target_id       text,
  reason          text,
  metadata        jsonb not null default '{}'::jsonb,
  ip_address      inet,
  created_at      timestamptz not null default now()
);

create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

-- ── updated_at maintenance ──────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger organizations_touch
  before update on public.organizations
  for each row execute function public.touch_updated_at();

create trigger organization_members_touch
  before update on public.organization_members
  for each row execute function public.touch_updated_at();

-- ── profile provisioning ────────────────────────────────────────────────────
-- Supabase creates auth.users rows outside our control, so the profile is
-- created by trigger. Doing it in application code leaves a window where an
-- authenticated user has no profile row and every RLS policy denies them.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
