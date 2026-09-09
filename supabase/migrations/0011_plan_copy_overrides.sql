-- ============================================================================
-- AURELIS OS — owner-editable plan copy
--
-- What a plan is *called* and how it is *described* on the pricing page is
-- marketing, and marketing changes weekly. What a plan *allows* is a business
-- rule enforced on every request, and what it *costs* is Stripe's. This table
-- holds the first and deliberately none of the others.
--
-- The temptation is one editable "plans" table with a price column. That is
-- the drift lib/billing/plans.ts exists to prevent: a price stored here and a
-- price stored in Stripe will disagree within a month, and one of them is what
-- the customer is charged. Entitlements in a table would mean a limit that is
-- enforceable only after a query, and a typo in a row that grants the top tier.
--
-- So: name, audience line, highlights, limitations. Keyed by the plan key from
-- code, so a row cannot invent a plan that does not exist.
--
-- Service role only. RLS forced, no policies: the pricing page reads it with
-- the admin client because it is public and has no session, and the owner
-- console writes it through a route that checks platform:manage_flags first.
-- Tenants have no reason to reach it and no path to it.
-- ============================================================================

create table public.plan_copy_overrides (
  plan_key     text primary key
                 check (plan_key in ('free', 'starter', 'growth', 'scale')),
  name         text check (name is null or length(btrim(name)) between 1 and 40),
  audience     text check (audience is null or length(btrim(audience)) between 1 and 160),
  highlights   text[] check (highlights is null or cardinality(highlights) <= 6),
  limitations  text[] check (limitations is null or cardinality(limitations) <= 6),
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.plan_copy_overrides enable row level security;
alter table public.plan_copy_overrides force row level security;

comment on table public.plan_copy_overrides is
  'Service-role only. Display copy for plans. Never prices (Stripe) and never entitlements (code).';

create trigger plan_copy_overrides_touch
  before update on public.plan_copy_overrides
  for each row execute function public.touch_updated_at();
