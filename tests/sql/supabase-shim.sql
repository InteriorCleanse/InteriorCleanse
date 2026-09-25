-- ============================================================================
-- Supabase shim for the RLS integration tests.
--
-- The migrations are written for Supabase and depend on three things a plain
-- Postgres does not have: the `auth` schema (`auth.users`, `auth.uid()`), the
-- `anon` / `authenticated` / `service_role` roles, and Supabase's default
-- grants on the `public` schema.
--
-- This file recreates exactly those, and nothing else. It is deliberately not
-- a convenience layer: every definition here mirrors Supabase's own so that a
-- test passing locally means the same thing in production. In particular
-- `auth.uid()` reads the same session settings PostgREST sets, so the tests
-- authenticate the way the real request path does rather than through a
-- back door the product does not have.
--
-- Run this before 0001. It is never applied to a real project — Supabase
-- provides all of it already.
-- ============================================================================

-- ── Roles ───────────────────────────────────────────────────────────────────
-- nologin: the tests reach them with SET ROLE, which is how PostgREST switches
-- from its connection role to the request's role.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- BYPASSRLS is the whole point of the service role, and the reason it is
    -- never sent to a browser. Tests that use it prove nothing about isolation.
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- ── auth schema ─────────────────────────────────────────────────────────────

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Supabase's definition, reproduced. It reads the request's JWT claims from
-- session settings, so a test "signs in" by setting the same GUC PostgREST
-- sets — not by passing a user id into a helper of its own.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user::text
  )
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- ── public schema grants ────────────────────────────────────────────────────
-- Supabase grants these by default. Without them every policy would be
-- untestable: the request would fail on a plain permission check before RLS
-- was ever consulted, and a test could not tell "denied by policy" from
-- "denied by GRANT". Migrations revoke specific function rights on top of
-- these, and those revokes must still take effect — hence default privileges
-- rather than a blanket grant afterwards.

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
