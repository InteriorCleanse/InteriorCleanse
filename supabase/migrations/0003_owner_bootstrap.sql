-- ============================================================================
-- AURELIS OS — Checkpoint 1: platform owner bootstrap
--
-- There is no public owner registration and no owner-signup screen. The first
-- platform_owner is claimed by an email on an environment-controlled allowlist,
-- exactly once, through a SECURITY DEFINER function that the application calls
-- with the service role.
--
-- Why a function rather than a seeded row: the owner's user id does not exist
-- until that person signs up through normal auth, so it cannot be written into
-- a migration. Why not plain application code: platform_staff intentionally has
-- no INSERT policy for anyone, so only a definer function or the service role
-- can write it — and the function keeps the rule in the database where it can
-- be audited.
-- ============================================================================

-- Allowlist of emails permitted to claim platform ownership. Populated from
-- the PLATFORM_OWNER_EMAILS environment variable by scripts/bootstrap-owner.mjs
-- — never hardcoded here, so the list can differ per environment.
create table public.platform_owner_allowlist (
  email       text primary key check (position('@' in email) > 1),
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.platform_owner_allowlist enable row level security;
alter table public.platform_owner_allowlist force row level security;

-- No policies at all: readable and writable only by the service role.
comment on table public.platform_owner_allowlist is
  'Service-role only. Emails permitted to claim platform_owner exactly once.';

-- ── claim_platform_ownership ────────────────────────────────────────────────
-- Idempotent and self-closing: once any platform_owner exists, further claims
-- are refused even for allowlisted emails. Promotion beyond that point is an
-- explicit act by an existing owner, which is audited separately.

create or replace function public.claim_platform_ownership(claimant uuid)
returns public.platform_role
language plpgsql
security definer
set search_path = public
as $$
declare
  claimant_email text;
  existing_owner int;
begin
  select email into claimant_email
  from public.profiles
  where id = claimant;

  if claimant_email is null then
    raise exception 'No profile for user %', claimant using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from public.platform_owner_allowlist a
    where lower(a.email) = lower(claimant_email)
  ) then
    raise exception 'Email is not on the platform owner allowlist'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into existing_owner
  from public.platform_staff
  where role = 'platform_owner';

  -- Already the owner: succeed quietly so a repeated bootstrap is harmless.
  if exists (
    select 1 from public.platform_staff
    where user_id = claimant and role = 'platform_owner'
  ) then
    return 'platform_owner'::public.platform_role;
  end if;

  if existing_owner > 0 then
    raise exception 'A platform owner already exists; ownership cannot be re-claimed'
      using errcode = 'unique_violation';
  end if;

  insert into public.platform_staff (user_id, role, granted_by)
  values (claimant, 'platform_owner', claimant);

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    claimant,
    'platform.ownership_claimed',
    'platform_staff',
    claimant::text,
    jsonb_build_object('email', claimant_email, 'source', 'env_allowlist')
  );

  return 'platform_owner'::public.platform_role;
end;
$$;

revoke all on function public.claim_platform_ownership(uuid) from public, anon, authenticated;

comment on function public.claim_platform_ownership(uuid) is
  'Service-role only. Grants platform_owner once, to an allowlisted email.';
