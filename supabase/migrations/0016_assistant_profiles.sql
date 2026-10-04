-- ============================================================================
-- AURELIS OS — one agent per business
--
-- An operator running several companies wants each one to have its own
-- analyst with its own name and its own standing orders — "watch margin on
-- the candle range", "the brand campaign is judged on new customers, not
-- ROAS" — while the operator's own assistant watches all of them.
--
-- A profile is configuration, not authority. The standing orders are shown to
-- the model as the workspace's preferences, under the product's own rules,
-- and they cannot widen the tool surface or lift the approval gate; the
-- prompt says so. Admins write them because they shape what every member
-- hears; members read them because a person should know what their analyst
-- was told.
-- ============================================================================

create table public.assistant_profiles (
  organization_id  uuid primary key references public.organizations (id) on delete cascade,
  /* What this workspace calls its analyst. Null falls back to the deployment's name. */
  agent_name       text check (agent_name is null or length(agent_name) between 1 and 40),
  /* One line on what this business is and what matters in it. */
  focus            text not null default '' check (length(focus) <= 300),
  /* Durable instructions, in the operator's words. Bounded: a page of orders
     is a prompt, not a preference. */
  standing_orders  text not null default '' check (length(standing_orders) <= 2000),
  /* Whether the workspace's analyst should be reported on in the owner's
     portfolio view. Off means the company is still listed, with no agent. */
  reports_to_owner boolean not null default true,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.assistant_profiles enable row level security;
alter table public.assistant_profiles force row level security;

create policy assistant_profiles_select on public.assistant_profiles
  for select using (public.is_org_member(organization_id));

create policy assistant_profiles_write on public.assistant_profiles
  for all
  using (public.has_org_role_at_least(organization_id, 'tenant_admin'))
  with check (public.has_org_role_at_least(organization_id, 'tenant_admin'));

create trigger assistant_profiles_touch
  before update on public.assistant_profiles
  for each row execute function public.touch_updated_at();

comment on table public.assistant_profiles is
  'Per-workspace analyst: its name, focus and standing orders. Preferences, never authority.';
