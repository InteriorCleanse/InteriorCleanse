-- ============================================================================
-- AURELIS OS — Checkpoint 1: Row Level Security
--
-- Isolation model:
--   * Every tenant-owned table has organization_id.
--   * Membership is resolved by SECURITY DEFINER helpers so policies do not
--     recurse (a policy on organization_members that itself selects from
--     organization_members deadlocks the planner into infinite recursion).
--   * Platform staff get read access for support, never silent write access.
-- ============================================================================

-- ── Helper functions ────────────────────────────────────────────────────────
-- SECURITY DEFINER + a locked search_path: these run as the owner so they can
-- read membership without being subject to the very policies they support.

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.org_role(org uuid)
returns public.tenant_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = auth.uid()
    and m.status = 'active';
$$;

-- Ranked comparison so policies can express "admin or above" without
-- enumerating every role at every call site.
create or replace function public.org_role_rank(r public.tenant_role)
returns int
language sql
immutable
as $$
  select case r
    when 'tenant_owner' then 400
    when 'tenant_admin' then 300
    when 'analyst'      then 200
    when 'member'       then 100
    when 'viewer'       then 50
  end;
$$;

create or replace function public.has_org_role_at_least(org uuid, minimum public.tenant_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.org_role_rank(public.org_role(org)) >= public.org_role_rank(minimum),
    false
  );
$$;

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_staff s where s.user_id = auth.uid()
  );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff s
    where s.user_id = auth.uid()
      and s.role = 'platform_owner'
  );
$$;

-- ── Enable RLS ──────────────────────────────────────────────────────────────
-- Default-deny: with RLS on and no matching policy, access is refused.

alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_staff       enable row level security;
alter table public.audit_logs           enable row level security;

-- Force RLS for table owners too, so a mistakenly-owner-authenticated
-- connection does not quietly bypass every policy below.
alter table public.organizations        force row level security;
alter table public.organization_members force row level security;
alter table public.audit_logs           force row level security;

-- ── profiles ────────────────────────────────────────────────────────────────

create policy profiles_select_self
  on public.profiles for select
  using (id = auth.uid() or public.is_platform_staff());

-- A user can see co-members' profiles, which the team screen needs.
create policy profiles_select_co_members
  on public.profiles for select
  using (
    exists (
      select 1
      from public.organization_members me
      join public.organization_members them
        on them.organization_id = me.organization_id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.user_id = public.profiles.id
    )
  );

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── organizations ───────────────────────────────────────────────────────────

create policy organizations_select_members
  on public.organizations for select
  using (public.is_org_member(id) or public.is_platform_staff());

-- Any authenticated user may create a workspace; they must record themselves
-- as its creator. The owner membership row is added by trigger below.
create policy organizations_insert_authenticated
  on public.organizations for insert
  to authenticated
  with check (created_by = auth.uid());

create policy organizations_update_admins
  on public.organizations for update
  using (public.has_org_role_at_least(id, 'tenant_admin'))
  with check (public.has_org_role_at_least(id, 'tenant_admin'));

-- Deleting a workspace is owner-only and soft (deleted_at), handled in the
-- application; no DELETE policy is granted here.

-- ── organization_members ────────────────────────────────────────────────────

create policy organization_members_select
  on public.organization_members for select
  using (
    user_id = auth.uid()
    or public.is_org_member(organization_id)
    or public.is_platform_staff()
  );

create policy organization_members_insert_admins
  on public.organization_members for insert
  with check (public.has_org_role_at_least(organization_id, 'tenant_admin'));

create policy organization_members_update_admins
  on public.organization_members for update
  using (public.has_org_role_at_least(organization_id, 'tenant_admin'))
  with check (public.has_org_role_at_least(organization_id, 'tenant_admin'));

create policy organization_members_delete_admins
  on public.organization_members for delete
  using (public.has_org_role_at_least(organization_id, 'tenant_admin'));

-- ── platform_staff ──────────────────────────────────────────────────────────
-- Readable by staff only. No INSERT/UPDATE/DELETE policy exists at all, so
-- membership can only be changed by the service role (see 0003 bootstrap).
-- This is the single most sensitive table in the system.

create policy platform_staff_select_staff
  on public.platform_staff for select
  using (public.is_platform_staff());

-- ── audit_logs ──────────────────────────────────────────────────────────────
-- Append-only from the application's perspective: no UPDATE or DELETE policy
-- is granted to anyone, including platform owners.

create policy audit_logs_select_org_admins
  on public.audit_logs for select
  using (
    (organization_id is not null and public.has_org_role_at_least(organization_id, 'tenant_admin'))
    or public.is_platform_staff()
  );

create policy audit_logs_insert_members
  on public.audit_logs for insert
  with check (
    actor_user_id = auth.uid()
    and (organization_id is null or public.is_org_member(organization_id))
  );

-- ── Founding-owner trigger ──────────────────────────────────────────────────
-- The creator of a workspace becomes its tenant_owner in the same transaction.
-- Doing this in application code leaves a workspace that nobody can administer
-- if the second statement fails.

create or replace function public.add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_members (organization_id, user_id, role, status)
  values (new.id, new.created_by, 'tenant_owner', 'active')
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

create trigger organizations_add_creator_as_owner
  after insert on public.organizations
  for each row
  when (new.created_by is not null)
  execute function public.add_creator_as_owner();

-- ── Last-owner protection ───────────────────────────────────────────────────
-- Prevents a workspace from being orphaned by demoting or removing its final
-- owner. A CHECK constraint cannot express this because the rule spans rows.

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  remaining int;
begin
  target_org := coalesce(old.organization_id, new.organization_id);

  -- Only guard transitions that actually remove an active owner.
  if tg_op = 'UPDATE'
     and old.role = 'tenant_owner'
     and new.role = 'tenant_owner'
     and new.status = 'active' then
    return new;
  end if;

  if old.role is distinct from 'tenant_owner' or old.status <> 'active' then
    return coalesce(new, old);
  end if;

  select count(*) into remaining
  from public.organization_members m
  where m.organization_id = target_org
    and m.role = 'tenant_owner'
    and m.status = 'active'
    and m.id <> old.id;

  if remaining = 0 then
    raise exception
      'Cannot remove or demote the last owner of organization %. Promote another owner first.',
      target_org
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function public.prevent_last_owner_removal();
