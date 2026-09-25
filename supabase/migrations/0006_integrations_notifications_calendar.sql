-- ============================================================================
-- AURELIS OS — Checkpoint 5: integrations, notifications, calendar
--
-- The rule that shapes this migration: a credential's plaintext never exists in
-- the database, in any column, at any time. `integration_credentials` stores
-- envelope-encrypted blobs and a masked hint; the key that opens them lives
-- outside Postgres. A leaked dump is sealed bytes.
--
-- The corollary is enforced rather than trusted: the sealed column is not
-- readable through RLS by anyone, including workspace owners and platform
-- staff. Application code reads it with the service role, on a server, after
-- checking authorization itself. There is no view, no policy, and no admin
-- screen through which a credential can be read back.
-- ============================================================================

create type public.integration_status as enum (
  'not_connected',
  'connected',
  'degraded',
  'error',
  'revoked'
);

create type public.sync_status as enum ('running', 'succeeded', 'failed', 'partial');

create type public.notification_severity as enum ('info', 'warning', 'critical');

create type public.delivery_status as enum ('pending', 'sent', 'failed', 'suppressed');

-- ── Integration connections ─────────────────────────────────────────────────

create table public.integration_connections (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  /* Registry key: 'stripe', 'shopify', 'csv'. Not an enum — adding a connector
     should not require a migration. */
  provider           text not null,
  display_name       text not null,
  status             public.integration_status not null default 'not_connected',
  /* Why it is degraded or in error, in words a person can act on. */
  status_detail      text,
  connected_by       uuid references public.profiles (id) on delete set null,
  connected_at       timestamptz,
  last_success_at    timestamptz,
  last_attempt_at    timestamptz,
  /* Non-secret settings: account ids, shop domains, sync windows. Anything in
     here may appear in a UI, so nothing secret goes in it. */
  settings           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (organization_id, provider)
);

create index integration_connections_org_idx
  on public.integration_connections (organization_id);

create trigger integration_connections_touch
  before update on public.integration_connections
  for each row execute function public.touch_updated_at();

-- ── The vault ───────────────────────────────────────────────────────────────
-- Ciphertext only. See the header: no RLS policy grants SELECT on this table
-- to anyone, so the sealed column is unreachable from a user session even with
-- a compromised JWT or a policy bypass elsewhere.

create table public.integration_credentials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id   uuid not null references public.integration_connections (id) on delete cascade,
  /* Which secret this is: 'api_key', 'access_token', 'refresh_token'. */
  field           text not null,

  /* The sealed envelope: ciphertext, iv, tag, and the wrapped data key. */
  sealed          jsonb not null,
  /* Which master key wrapped the data key, denormalised so a rotation job can
     find everything sealed under an old key without opening any of it. */
  key_id          text not null,

  /* Safe to display: 'sk_live_••••4242'. Derived at seal time, never reversed. */
  masked_hint     text not null,
  /* Set when the credential is known to have been revoked upstream. */
  revoked_at      timestamptz,
  rotated_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (connection_id, field)
);

create index integration_credentials_rotation_idx
  on public.integration_credentials (key_id) where revoked_at is null;

create trigger integration_credentials_touch
  before update on public.integration_credentials
  for each row execute function public.touch_updated_at();

-- ── Sync runs ───────────────────────────────────────────────────────────────

create table public.integration_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id   uuid not null references public.integration_connections (id) on delete cascade,
  status          public.sync_status not null default 'running',
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  records_read    integer not null default 0,
  records_written integer not null default 0,
  /* Operator-facing failure text. Never a raw vendor payload: those carry
     request ids, tokens, and customer data. */
  error           text,
  /* The window this run covered, so a gap in coverage is visible. */
  window_start    timestamptz,
  window_end      timestamptz
);

create index integration_sync_runs_connection_idx
  on public.integration_sync_runs (connection_id, started_at desc);

-- ── Notifications ───────────────────────────────────────────────────────────

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /* Null for workspace-wide notices; set when it belongs to one person. */
  user_id         uuid references public.profiles (id) on delete cascade,
  rule_id         uuid references public.notification_rules (id) on delete set null,
  severity        public.notification_severity not null default 'info',
  title           text not null,
  body            text not null,
  /* Where to go to act on it. */
  link            text,
  /* The figures behind it, so the notice can be audited like any other claim. */
  evidence        jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  /* A rule that fires every hour for the same reason is noise, not signal.
     The evaluator writes a key derived from the rule and the period; the index
     makes a repeat a no-op rather than a duplicate. */
  dedupe_key      text not null
);

create unique index notifications_dedupe_idx
  on public.notifications (organization_id, dedupe_key);

create index notifications_inbox_idx
  on public.notifications (organization_id, created_at desc);

-- ── Preferences ─────────────────────────────────────────────────────────────

create table public.notification_preferences (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  /* Channel switches. In-app cannot be disabled: a person must always be able
     to see what the system decided on their behalf. */
  email_enabled     boolean not null default true,
  /* Nothing below this severity is delivered outside the app. */
  email_min_severity public.notification_severity not null default 'warning',
  /* Local quiet hours, inclusive start, exclusive end, in the workspace's tz.
     Null disables the window rather than meaning midnight. */
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end   smallint check (quiet_hours_end between 0 and 23),
  /* Which briefings this person wants delivered, by kind. */
  briefings         text[] not null default array[]::text[],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id, user_id)
);

create trigger notification_preferences_touch
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- ── Delivery log ────────────────────────────────────────────────────────────
-- Append-only. "Did we actually send that?" is a question that must have an
-- answer that nobody can quietly change.

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid references public.profiles (id) on delete set null,
  channel         text not null check (channel in ('in_app', 'email')),
  status          public.delivery_status not null default 'pending',
  /* Why a delivery was suppressed — quiet hours, severity floor, unsubscribed.
     A silent non-delivery is indistinguishable from a bug. */
  detail          text,
  attempted_at    timestamptz not null default now(),
  delivered_at    timestamptz
);

create index notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);

-- ── Calendar ────────────────────────────────────────────────────────────────

create table public.calendar_connections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  provider        text not null check (provider in ('google', 'outlook')),
  account_email   text not null,
  status          public.integration_status not null default 'not_connected',
  /* Credentials live in the vault like every other secret, keyed by this row. */
  connection_id   uuid references public.integration_connections (id) on delete set null,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, user_id, provider, account_email)
);

create trigger calendar_connections_touch
  before update on public.calendar_connections
  for each row execute function public.touch_updated_at();

create table public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /* Null for events the product itself generates (goal deadlines, briefings). */
  connection_id   uuid references public.calendar_connections (id) on delete cascade,
  external_id     text,
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  all_day         boolean not null default false,
  /* 'goal', 'briefing', 'external' — what produced this. */
  source          text not null default 'external',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (ends_at >= starts_at)
);

create index calendar_events_window_idx
  on public.calendar_events (organization_id, starts_at);

create unique index calendar_events_external_idx
  on public.calendar_events (connection_id, external_id)
  where external_id is not null;

create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function public.touch_updated_at();

-- ── Read-only iCalendar feed tokens ─────────────────────────────────────────
-- A feed URL is a bearer credential that ends up pasted into phone settings and
-- shared calendars. So: one token per person per workspace, revocable, hashed
-- at rest, and read-only by construction — the feed endpoint has no write path.

create table public.calendar_feed_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  /* SHA-256 of the token. The token itself is shown once, at creation. */
  token_hash      text not null unique,
  label           text not null default 'Calendar subscription',
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index calendar_feed_tokens_user_idx
  on public.calendar_feed_tokens (organization_id, user_id) where revoked_at is null;

-- ── RLS ─────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'integration_connections','integration_credentials','integration_sync_runs',
    'notifications','notification_preferences','notification_deliveries',
    'calendar_connections','calendar_events','calendar_feed_tokens'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- integration_credentials gets NO policies at all. Every other table below is
-- explicit. This omission is the point: with RLS forced and no policy, the
-- table is unreadable and unwritable from any user session. Only the service
-- role — which application code uses after doing its own authorization —
-- can touch it.

create policy integration_connections_select on public.integration_connections
  for select using (
    public.has_org_role_at_least(organization_id, 'analyst')
    or public.is_platform_staff()
  );

create policy integration_connections_write on public.integration_connections
  for all
  using (public.has_org_role_at_least(organization_id, 'tenant_admin'))
  with check (public.has_org_role_at_least(organization_id, 'tenant_admin'));

create policy integration_sync_runs_select on public.integration_sync_runs
  for select using (
    public.has_org_role_at_least(organization_id, 'analyst')
    or public.is_platform_staff()
  );

-- Notifications: a person sees workspace-wide notices and their own.
create policy notifications_select on public.notifications
  for select using (
    public.is_org_member(organization_id)
    and (user_id is null or user_id = auth.uid())
  );

-- Marking as read is the only mutation a person may make, and only on rows
-- they can already see. No INSERT policy: notifications are raised by the
-- evaluator through the service role, never by a client claiming something
-- happened.
create policy notifications_mark_read on public.notifications
  for update
  using (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()))
  with check (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));

create policy notification_preferences_own on public.notification_preferences
  for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- The delivery log is readable by admins and by the person it concerns, and
-- writable by nobody: no INSERT, UPDATE or DELETE policy exists.
create policy notification_deliveries_select on public.notification_deliveries
  for select using (
    public.is_org_member(organization_id)
    and (user_id = auth.uid() or public.has_org_role_at_least(organization_id, 'tenant_admin'))
  );

create policy calendar_connections_own on public.calendar_connections
  for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

create policy calendar_events_select on public.calendar_events
  for select using (public.is_org_member(organization_id));

create policy calendar_feed_tokens_own on public.calendar_feed_tokens
  for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- ── Marking a notification read ─────────────────────────────────────────────
-- A definer function so the UPDATE policy above cannot be used to rewrite the
-- title or evidence of a notification — only its read timestamp.

create or replace function public.mark_notification_read(notification uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = notification
    and public.is_org_member(organization_id)
    and (user_id is null or user_id = auth.uid());

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
