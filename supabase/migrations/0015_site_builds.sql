-- ============================================================================
-- AURELIS OS — sites the assistant builds
--
-- "Build me a site for the bakery" ends, after approval, in a row here: one
-- self-contained HTML document, private to the workspace, previewed in a
-- sandbox and published only after a second, separate approval. The document
-- is bounded so a generation cannot fill a table, and the row records where
-- it went when it was published — the address and the deployment id — so a
-- person can find it in their own Vercel account without this product.
--
-- Members can see what was built; only an admin can create, change or
-- remove one, which matches who can approve the action that creates it.
-- ============================================================================

create table public.site_builds (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  created_by       uuid references public.profiles (id) on delete set null,
  name             text not null check (length(name) between 1 and 120),
  /* The plain-language brief the site was built from, kept so the page can
     say what it was asked for next to what it made. */
  brief            text not null check (length(brief) <= 4000),
  html             text not null check (length(html) <= 400000),
  status           text not null default 'generated'
                     check (status in ('generated', 'published', 'failed')),
  published_url    text,
  deployment_id    text,
  /* Why the last publish failed, in operator words. Never a token. */
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index site_builds_org_idx on public.site_builds (organization_id, created_at desc);

alter table public.site_builds enable row level security;
alter table public.site_builds force row level security;

create policy site_builds_select on public.site_builds
  for select using (public.is_org_member(organization_id));

create policy site_builds_write on public.site_builds
  for all
  using (public.has_org_role_at_least(organization_id, 'tenant_admin'))
  with check (public.has_org_role_at_least(organization_id, 'tenant_admin'));

create trigger site_builds_touch
  before update on public.site_builds
  for each row execute function public.touch_updated_at();

comment on table public.site_builds is
  'One-page sites built by the assistant on approval. Private until a second approval publishes one.';
