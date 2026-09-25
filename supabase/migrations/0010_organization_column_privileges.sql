-- ============================================================================
-- AURELIS OS — which columns of `organizations` a tenant may write
--
-- Found while building workspace deletion, by asking the database rather than
-- reading the code: a `tenant_admin` could set `deleted_at` directly through
-- PostgREST and delete the workspace. The API route for that is owner-only,
-- requires the workspace name typed out, writes an audit entry, and destroys
-- stored credentials first. None of that ran. The row simply changed.
--
-- RLS was working exactly as written — `organizations_update_admins` permits an
-- admin to update the organization — and that was the mistake. RLS answers
-- "which rows", never "which columns", and the two questions are different for
-- this table: an admin renaming the workspace and an admin ending it are not
-- the same act.
--
-- The columns closed here, and what each would otherwise allow:
--
--   deleted_at           delete the workspace, bypassing owner-only, the typed
--                        confirmation, the audit entry, and the destruction of
--                        stored credentials. A non-owner denial of service with
--                        no record of who did it.
--   plan_key             grant the workspace a plan nobody paid for. Not
--                        currently read for entitlement — those come from
--                        `subscriptions` — but 0001 describes this column as
--                        somewhere authoritative to read from, and the day
--                        somebody does, it is self-service upgrades.
--   subscription_status  leave a cancelled workspace looking active.
--   trial_ends_at        extend a trial indefinitely.
--   is_demo              unset the demonstration flag, so synthetic figures
--                        stop being labelled as synthetic on every surface that
--                        reads it. The one bit of state whose whole purpose is
--                        to stop numbers being mistaken for real ones.
--   created_by           rewrite who founded the workspace, and with it who the
--                        founding-owner trigger credited.
--
-- Column privileges rather than a policy, because a policy cannot express this.
-- Table-level UPDATE implies every column, so revoking a subset from a role
-- that holds the table-level grant does nothing: the table grant is withdrawn
-- and the writable columns are granted back explicitly. RLS still applies on
-- top — this narrows what an admin may write, it does not widen who may write.
--
-- The service role keeps its full grant. The Stripe webhook and the deletion
-- endpoint both write these columns, and both already authorize the caller
-- themselves before doing so.
-- ============================================================================

revoke update on public.organizations from authenticated, anon;

grant update (
  name,
  slug,
  business_type,
  base_currency,
  timezone,
  reporting_week_starts_on,
  updated_at
) on public.organizations to authenticated;

comment on column public.organizations.deleted_at is
  'Service role only. Deletion goes through DELETE /api/workspace, which is owner-only, requires the name typed out, and destroys stored credentials first.';

comment on column public.organizations.is_demo is
  'Service role only. Demo workspaces must stay labelled; a tenant that could clear this could present synthetic figures as real.';
