-- ============================================================================
-- AURELIS OS — knowledge documents and CRM pipeline
--
-- Until now the assistant answered from figures alone. A business's
-- *decisions* live elsewhere: the refund policy is a Notion page, the
-- quarterly plan is an Obsidian note, the deals that will become next month's
-- revenue are in a CRM. Two tables, both tenant-scoped, both RLS-forced, so
-- the assistant can read them through the same isolation as everything else.
--
-- knowledge_documents holds whole documents, not chunks. A chunked store
-- needs an embedding pipeline, a vector index and a reranker to beat plain
-- full-text search on a few hundred pages, and it cannot show a person the
-- document it quoted. Postgres full-text search over a tsvector column is
-- boring, cheap, citable and good enough until a workspace has thousands of
-- pages — at which point that is a nice problem to have.
--
-- Content is bounded. A note is context for an answer, not an archive; a page
-- past the limit is stored truncated with a flag, never rejected, so the sync
-- does not fail on one long document.
-- ============================================================================

create table public.knowledge_documents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  connection_id     uuid references public.integration_connections (id) on delete set null,
  /* 'notion', 'obsidian', 'markdown'. Text, not an enum: a new source must not
     need a migration. */
  source            text not null,
  external_id       text not null,
  title             text not null check (length(title) between 1 and 300),
  /* Where a person can open the original. Null for an uploaded file. */
  url               text,
  /* Markdown. Bounded so a single page cannot become the whole context. */
  content           text not null check (length(content) <= 60000),
  truncated         boolean not null default false,
  /* So an unchanged page is a no-op on re-sync rather than a rewrite. */
  content_hash      text not null,
  source_updated_at timestamptz,
  imported_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  /* Generated, so it can never be stale relative to the content. Title is
     weighted above body: a question that names a page should find that page. */
  search            tsvector generated always as (
                      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(content, '')), 'B')
                    ) stored,

  unique (organization_id, source, external_id)
);

create index knowledge_documents_search_idx on public.knowledge_documents using gin (search);
create index knowledge_documents_org_idx on public.knowledge_documents (organization_id, updated_at desc);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_documents force row level security;

-- Anyone in the workspace can read what the assistant reads: the whole point
-- is that an answer can be checked against its source.
create policy knowledge_documents_select on public.knowledge_documents
  for select using (public.is_org_member(organization_id));

-- Importing a note is the same act as importing a CSV — a member's job.
create policy knowledge_documents_insert on public.knowledge_documents
  for insert with check (public.has_org_role_at_least(organization_id, 'member'));
create policy knowledge_documents_update on public.knowledge_documents
  for update using (public.has_org_role_at_least(organization_id, 'member'))
             with check (public.has_org_role_at_least(organization_id, 'member'));
create policy knowledge_documents_delete on public.knowledge_documents
  for delete using (public.has_org_role_at_least(organization_id, 'member'));

create trigger knowledge_documents_touch
  before update on public.knowledge_documents
  for each row execute function public.touch_updated_at();

comment on table public.knowledge_documents is
  'Notes and pages the assistant may cite. Whole documents, full-text searched; content bounded.';

-- ── CRM deals ───────────────────────────────────────────────────────────────
-- Deals are the revenue that has not happened yet. They are deliberately kept
-- apart from orders: an order is money that moved, a deal is money somebody
-- hopes will. Summing the two is the most common way a pipeline dashboard
-- overstates a business, and separate tables make the mistake harder.

create table public.crm_deals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  connection_id     uuid references public.integration_connections (id) on delete set null,
  source            text not null,
  external_id       text not null,
  name              text not null,
  /* The vendor's own stage label, as they show it. Not normalised: every CRM
     lets a customer rename stages and the dashboard should match their CRM. */
  stage             text not null,
  /* Whether the vendor considers this stage won, lost, or still open. */
  outcome           text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  amount_minor      bigint check (amount_minor is null or amount_minor >= 0),
  currency          char(3),
  /* Vendor-reported probability, 0–100, if it reports one. Not ours. */
  probability       smallint check (probability is null or probability between 0 and 100),
  expected_close_on date,
  owner_name        text,
  customer_id       uuid references public.customers (id) on delete set null,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id, source, external_id)
);

create index crm_deals_org_stage_idx on public.crm_deals (organization_id, outcome, expected_close_on);

alter table public.crm_deals enable row level security;
alter table public.crm_deals force row level security;

create policy crm_deals_select on public.crm_deals
  for select using (public.is_org_member(organization_id));
-- Written by the sync, which runs as the service role. Members do not edit
-- deals here; they edit them in the CRM, and the next sync reflects it.

create trigger crm_deals_touch
  before update on public.crm_deals
  for each row execute function public.touch_updated_at();

comment on table public.crm_deals is
  'Pipeline mirrored from a CRM. Money that has not happened yet — never summed with orders.';

-- Slack joins the delivery channels. The check was the only thing naming them.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
  check (channel in ('in_app', 'email', 'slack'));
