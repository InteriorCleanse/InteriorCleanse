-- ============================================================================
-- AURELIS OS — mail connections
--
-- "Read me my new email" is the other half of running a day by voice. A
-- mailbox is per person, like a calendar and unlike a Stripe account: two
-- colleagues each connect their own Gmail, and neither sees the other's.
--
-- Nothing from a mailbox is stored. The assistant reads unread mail live, at
-- the moment it is asked, and keeps none of it: a copy of someone's inbox in
-- a tenant database is a liability the product does not need in order to say
-- "three things need a reply". What is stored is the connection itself and a
-- sealed refresh token, in the one credential table, under a third owner
-- column — the check constraint still says exactly one.
-- ============================================================================

create table public.mail_connections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  provider        text not null check (provider in ('gmail')),
  account_email   text not null,
  status          public.integration_status not null default 'not_connected',
  /* Operator-facing reason for a degraded or revoked state. Never a token. */
  status_detail   text,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, user_id, provider, account_email)
);

create trigger mail_connections_touch
  before update on public.mail_connections
  for each row execute function public.touch_updated_at();

alter table public.mail_connections enable row level security;
alter table public.mail_connections force row level security;

-- Own rows only, even within the workspace. A colleague's inbox is not the
-- workspace's to display, and an admin's role does not reach into it.
create policy mail_connections_own on public.mail_connections
  for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

comment on table public.mail_connections is
  'A person''s connected mailbox. Read live by the assistant; no mail is stored.';

-- ── The refresh token lives with every other secret ─────────────────────────

alter table public.integration_credentials
  add column mail_connection_id uuid
    references public.mail_connections (id) on delete cascade;

alter table public.integration_credentials
  drop constraint integration_credentials_one_owner;

alter table public.integration_credentials
  add constraint integration_credentials_one_owner
  check (
    (connection_id is not null)::int
    + (calendar_connection_id is not null)::int
    + (mail_connection_id is not null)::int
    = 1
  );

-- A full unique index rather than a partial one: NULLs are distinct, so the
-- rows that belong to other owners never collide, and ON CONFLICT can infer it.
create unique index integration_credentials_mail_field_idx
  on public.integration_credentials (mail_connection_id, field);

comment on column public.integration_credentials.mail_connection_id is
  'Set instead of connection_id when the secret belongs to a per-user mailbox connection.';

-- Still no policies on integration_credentials. The table remains reachable
-- only by the service role, which is the point.
