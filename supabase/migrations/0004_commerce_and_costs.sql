-- ============================================================================
-- AURELIS OS — Checkpoint 2: commerce, costs, and imports
--
-- Money is stored as bigint minor units alongside its currency. Never numeric
-- with a float cast, never a bare number without a currency: a figure whose
-- currency is implicit is a figure that eventually gets added to the wrong one.
--
-- Every table here is tenant-owned, so every table gets organization_id, RLS in
-- this same migration (never a follow-up), and an external-id uniqueness scope
-- of (organization_id, source, external_id) so two tenants importing the same
-- Stripe object never collide.
-- ============================================================================

-- ── Import batches ──────────────────────────────────────────────────────────
-- Created before any rows are written so every imported record can point back
-- at the batch that produced it. That pointer is what makes rollback possible
-- and what gives a dashboard number its lineage.

create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source          text not null,
  kind            text not null check (kind in ('orders','products','costs','expenses','ad_spend')),
  filename        text,
  status          text not null default 'pending'
                    check (status in ('pending','committed','rolled_back','failed')),
  row_count       integer not null default 0,
  skipped_count   integer not null default 0,
  error_count     integer not null default 0,
  -- Rejecting a re-upload of the same file is cheaper than de-duplicating rows
  -- afterwards, and far cheaper than double-counting revenue.
  content_hash    text,
  summary         jsonb not null default '{}'::jsonb,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  committed_at    timestamptz,
  rolled_back_at  timestamptz,

  unique (organization_id, kind, content_hash)
);

create index import_batches_org_idx on public.import_batches (organization_id, created_at desc);

-- ── Stores ──────────────────────────────────────────────────────────────────

create table public.stores (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  platform        text not null default 'manual',
  external_id     text,
  currency        char(3) not null default 'USD',
  created_at      timestamptz not null default now(),
  unique (organization_id, platform, external_id)
);

create index stores_org_idx on public.stores (organization_id);

-- ── Products and variants ───────────────────────────────────────────────────

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id        uuid references public.stores (id) on delete set null,
  source          text not null default 'manual',
  external_id     text,
  sku             text,
  name            text not null,
  category        text,
  status          text not null default 'active' check (status in ('active','archived')),
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index products_org_idx on public.products (organization_id);
create index products_sku_idx on public.products (organization_id, sku);

create table public.product_variants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete cascade,
  source          text not null default 'manual',
  external_id     text,
  sku             text,
  name            text,
  created_at      timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index product_variants_product_idx on public.product_variants (product_id);

-- Costs are effective-dated: restating history when a supplier price changes
-- would silently rewrite last quarter's margin.
create table public.product_costs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  product_id         uuid not null references public.products (id) on delete cascade,
  variant_id         uuid references public.product_variants (id) on delete cascade,
  unit_cost_minor    bigint not null check (unit_cost_minor >= 0),
  fulfillment_minor  bigint not null default 0 check (fulfillment_minor >= 0),
  currency           char(3) not null,
  effective_from     date not null default current_date,
  effective_to       date,
  source             text not null default 'manual',
  import_batch_id    uuid references public.import_batches (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index product_costs_lookup_idx
  on public.product_costs (organization_id, product_id, effective_from desc);

-- ── Customers ───────────────────────────────────────────────────────────────

create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  source            text not null default 'manual',
  external_id       text,
  email             text,
  first_name        text,
  last_name         text,
  first_order_at    timestamptz,
  acquisition_source text,
  created_at        timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index customers_org_email_idx on public.customers (organization_id, lower(email));

-- ── Orders ──────────────────────────────────────────────────────────────────

create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  store_id               uuid references public.stores (id) on delete set null,
  customer_id            uuid references public.customers (id) on delete set null,
  source                 text not null default 'manual',
  external_id            text,
  order_number           text,
  currency               char(3) not null,
  placed_at              timestamptz not null,

  shipping_revenue_minor bigint not null default 0,
  tax_minor              bigint not null default 0,
  payment_fees_minor     bigint not null default 0,
  marketplace_fees_minor bigint not null default 0,

  -- Test orders stay in the table so imports remain faithful to the source,
  -- and are excluded at query time instead of being dropped on ingest.
  is_test                boolean not null default false,
  is_new_customer        boolean not null default false,

  import_batch_id        uuid references public.import_batches (id) on delete set null,
  created_at             timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index orders_org_placed_idx on public.orders (organization_id, placed_at desc);
create index orders_batch_idx on public.orders (import_batch_id);

create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  order_id              uuid not null references public.orders (id) on delete cascade,
  product_id            uuid references public.products (id) on delete set null,
  variant_id            uuid references public.product_variants (id) on delete set null,
  product_name          text not null,
  quantity              integer not null check (quantity > 0),
  gross_minor           bigint not null,
  discount_minor        bigint not null default 0,
  -- Cost is snapshotted at import from the effective-dated cost, so later cost
  -- edits do not silently restate historical profit.
  cogs_minor            bigint,
  fulfillment_minor     bigint,
  currency              char(3) not null,
  created_at            timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (organization_id, product_id);

create table public.refunds (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id        uuid not null references public.orders (id) on delete cascade,
  source          text not null default 'manual',
  external_id     text,
  amount_minor    bigint not null check (amount_minor >= 0),
  return_cost_minor bigint,
  currency        char(3) not null,
  refunded_at     timestamptz not null,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index refunds_org_date_idx on public.refunds (organization_id, refunded_at desc);

-- ── Expenses and overhead ───────────────────────────────────────────────────

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category        text not null,
  description     text,
  amount_minor    bigint not null,
  currency        char(3) not null,
  incurred_on     date not null,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index expenses_org_date_idx on public.expenses (organization_id, incurred_on desc);

create table public.overhead_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  method          text not null check (method in ('fixed_monthly','percent_of_revenue')),
  amount_minor    bigint,
  percent         numeric(6,4),
  currency        char(3),
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  -- Exactly one of the two inputs must be present for the chosen method.
  check (
    (method = 'fixed_monthly' and amount_minor is not null and currency is not null)
    or (method = 'percent_of_revenue' and percent is not null)
  )
);

create index overhead_rules_org_idx on public.overhead_rules (organization_id, effective_from desc);

-- ── Exchange rates ──────────────────────────────────────────────────────────
-- Source and date are recorded so a converted figure can always explain itself.

create table public.exchange_rates (
  id            uuid primary key default gen_random_uuid(),
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate          numeric(20,10) not null check (rate > 0),
  as_of         date not null,
  source        text not null,
  created_at    timestamptz not null default now(),
  unique (base_currency, quote_currency, as_of, source)
);

-- ── Daily rollup ────────────────────────────────────────────────────────────
-- Written by the metrics engine. calculation_version preserves which set of
-- assumptions produced a figure, so changing a COGS rule does not make old
-- numbers unexplainable.

create table public.daily_business_metrics (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  metric_date               date not null,
  currency                  char(3) not null,
  gross_sales_minor         bigint not null default 0,
  net_revenue_minor         bigint not null default 0,
  gross_profit_minor        bigint not null default 0,
  contribution_profit_minor bigint not null default 0,
  ad_spend_minor            bigint not null default 0,
  order_count               integer not null default 0,
  units_sold                integer not null default 0,
  new_customers             integer not null default 0,
  allocation_model          text,
  unallocated_spend_minor   bigint not null default 0,
  calculation_version       integer not null default 1,
  computed_at               timestamptz not null default now(),
  unique (organization_id, metric_date, calculation_version)
);

create index daily_metrics_org_date_idx
  on public.daily_business_metrics (organization_id, metric_date desc);

-- ── updated_at triggers ─────────────────────────────────────────────────────

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Applied to every table above in the same migration that created it.

do $$
declare
  t text;
  tenant_tables text[] := array[
    'import_batches','stores','products','product_variants','product_costs',
    'customers','orders','order_items','refunds','expenses','overhead_rules',
    'daily_business_metrics'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    -- Read: any active member of the owning organization.
    execute format($p$
      create policy %1$s_select on public.%1$I for select
      using (public.is_org_member(organization_id) or public.is_platform_staff())
    $p$, t);

    -- Write: member or above. Viewers and analysts do not mutate business data;
    -- the finer capability rules live in lib/authz.ts, this is the floor.
    execute format($p$
      create policy %1$s_insert on public.%1$I for insert
      with check (public.has_org_role_at_least(organization_id, 'member'))
    $p$, t);

    execute format($p$
      create policy %1$s_update on public.%1$I for update
      using (public.has_org_role_at_least(organization_id, 'member'))
      with check (public.has_org_role_at_least(organization_id, 'member'))
    $p$, t);

    -- Delete is admin-only: this is how an import rollback removes its rows.
    execute format($p$
      create policy %1$s_delete on public.%1$I for delete
      using (public.has_org_role_at_least(organization_id, 'tenant_admin'))
    $p$, t);
  end loop;
end;
$$;

-- Exchange rates are reference data shared across tenants: readable by any
-- authenticated user, writable only by the service role (no write policy).
alter table public.exchange_rates enable row level security;

create policy exchange_rates_select on public.exchange_rates
  for select to authenticated using (true);

-- ── Import rollback ─────────────────────────────────────────────────────────
-- Deletes only rows belonging to one batch, inside one transaction, and refuses
-- to touch a batch from another organization even if an id is guessed.

create or replace function public.rollback_import_batch(batch uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  owning_org uuid;
  removed integer := 0;
  n integer;
begin
  select organization_id into owning_org
  from public.import_batches
  where id = batch;

  -- security invoker means the SELECT above is itself subject to RLS, so a
  -- batch in another tenant is simply not visible here.
  if owning_org is null then
    raise exception 'Import batch not found' using errcode = 'no_data_found';
  end if;

  if not public.has_org_role_at_least(owning_org, 'tenant_admin') then
    raise exception 'Only an admin can roll back an import'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.refunds where import_batch_id = batch;
  get diagnostics n = row_count; removed := removed + n;

  -- order_items cascade from orders.
  delete from public.orders where import_batch_id = batch;
  get diagnostics n = row_count; removed := removed + n;

  delete from public.expenses where import_batch_id = batch;
  get diagnostics n = row_count; removed := removed + n;

  delete from public.product_costs where import_batch_id = batch;
  get diagnostics n = row_count; removed := removed + n;

  delete from public.products where import_batch_id = batch;
  get diagnostics n = row_count; removed := removed + n;

  update public.import_batches
  set status = 'rolled_back', rolled_back_at = now()
  where id = batch;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (owning_org, auth.uid(), 'import.rolled_back', 'import_batch', batch::text,
          jsonb_build_object('rows_removed', removed));

  return removed;
end;
$$;
