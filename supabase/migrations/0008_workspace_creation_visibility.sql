-- ============================================================================
-- AURELIS OS — creating a workspace and reading it back in one statement
--
-- Found by the RLS integration tests in tests/rls.integration.test.ts, which is
-- exactly the class of bug they exist to catch: nothing in the TypeScript suite
-- could see it, because it only exists once policies are actually enforced.
--
-- The bug: `insert into organizations (...) returning id` fails for the person
-- creating the workspace.
--
--   * `organizations_select_members` allows a row through if the caller is an
--     active member of it.
--   * Membership is created by `organizations_add_creator_as_owner`, an AFTER
--     ROW trigger.
--   * RETURNING is projected before AFTER ROW triggers fire. At that instant
--     the creator is not yet a member, the SELECT policy rejects the row, and
--     the whole statement fails with "new row violates row-level security
--     policy".
--
-- The application currently inserts without RETURNING, so nothing is broken
-- today. That is luck, not design: `.insert(...).select()` is the idiomatic
-- Supabase call and the obvious next edit, and it would fail in production
-- while passing every test we had.
--
-- The fix has to be narrow. "The creator can always see the workspace" is the
-- tempting version and it is wrong: a founder later removed from the workspace
-- would keep reading its name, plan and billing status forever. Instead the
-- exception is open only while the organization has no membership rows at all
-- — true for the microseconds between the row landing and the trigger firing,
-- and false ever after, since the last-owner trigger makes a memberless
-- organization unreachable. The exception closes itself.
-- ============================================================================

-- SECURITY DEFINER for the same reason as the other membership helpers: a
-- policy on organizations that reads organization_members through RLS would
-- resolve against the caller's own visibility rather than the truth.
create or replace function public.org_has_members(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m where m.organization_id = org
  );
$$;

comment on function public.org_has_members(uuid) is
  'True once a workspace has any membership row. Used to close the founding-instant read exception.';

drop policy if exists organizations_select_members on public.organizations;

create policy organizations_select_members
  on public.organizations for select
  using (
    public.is_org_member(id)
    or public.is_platform_staff()
    -- The founding instant, and only that: before the owner-membership trigger
    -- has run. Once any member exists this disjunct is permanently false.
    or (created_by = auth.uid() and not public.org_has_members(id))
  );
