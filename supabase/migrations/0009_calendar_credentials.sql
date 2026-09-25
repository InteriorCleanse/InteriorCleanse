-- ============================================================================
-- AURELIS OS — vaulting calendar credentials
--
-- Calendar connections are per person, not per workspace: two colleagues each
-- connect their own Google account, and `calendar_connections` is keyed
-- accordingly. `integration_connections` is the opposite — one row per
-- workspace per provider — so a calendar refresh token has nowhere to live
-- under the original shape.
--
-- The tempting fix is a second secret store for calendar tokens. That is the
-- wrong answer: `integration_credentials` is the one table in this schema with
-- RLS forced and no policy at all, reachable only by the service role, and
-- every secret in the product being in exactly one place is most of why that
-- guarantee is worth anything. A second store doubles the surface and halves
-- the attention each half gets.
--
-- So the credential row learns to point at either kind of owner, and a check
-- constraint makes "exactly one" a database rule rather than a convention.
-- ============================================================================

alter table public.integration_credentials
  add column calendar_connection_id uuid
    references public.calendar_connections (id) on delete cascade;

alter table public.integration_credentials
  alter column connection_id drop not null;

alter table public.integration_credentials
  add constraint integration_credentials_one_owner
  check (
    (connection_id is not null and calendar_connection_id is null)
    or (connection_id is null and calendar_connection_id is not null)
  );

-- The original uniqueness was (connection_id, field). It still holds for
-- integration connections; calendar connections need their own, and a single
-- constraint over two nullable columns would not enforce either.
create unique index integration_credentials_calendar_field_idx
  on public.integration_credentials (calendar_connection_id, field)
  where calendar_connection_id is not null;

comment on column public.integration_credentials.calendar_connection_id is
  'Set instead of connection_id when the secret belongs to a per-user calendar connection.';

-- No policies are added. This table is still reachable only by the service
-- role, which is the point.
