-- ============================================================================
-- AURELIS OS — Checkpoint 4: the analyst
--
-- Threads, messages, tool runs, and — the load-bearing table — action
-- approvals. A write tool never executes on the model's say-so; it produces a
-- preview and an approval record bound to a specific user, organization, tool,
-- and exact arguments. Executing then re-checks that binding.
-- ============================================================================

create type public.assistant_role as enum ('user', 'assistant', 'system');

create type public.approval_state as enum (
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
  'superseded'
);

-- ── Threads ─────────────────────────────────────────────────────────────────

create table public.assistant_threads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by      uuid references public.profiles (id) on delete set null,
  title           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index assistant_threads_org_idx
  on public.assistant_threads (organization_id, updated_at desc);

create trigger assistant_threads_touch
  before update on public.assistant_threads
  for each row execute function public.touch_updated_at();

-- ── Messages ────────────────────────────────────────────────────────────────

create table public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id       uuid not null references public.assistant_threads (id) on delete cascade,
  role            public.assistant_role not null,
  content         text not null,
  /* Metric keys and record ids the answer was built from, so a claim can be
     traced back to what produced it. */
  citations       jsonb not null default '[]'::jsonb,
  /* Model usage for the owner console's cost-per-tenant view (Checkpoint 6). */
  input_tokens    integer,
  output_tokens   integer,
  model           text,
  created_at      timestamptz not null default now()
);

create index assistant_messages_thread_idx
  on public.assistant_messages (thread_id, created_at);

-- ── Tool runs ───────────────────────────────────────────────────────────────

create table public.assistant_tool_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id       uuid not null references public.assistant_threads (id) on delete cascade,
  message_id      uuid references public.assistant_messages (id) on delete set null,
  tool_name       text not null,
  arguments       jsonb not null default '{}'::jsonb,
  status          text not null default 'ok' check (status in ('ok', 'error', 'blocked')),
  error           text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

create index assistant_tool_runs_thread_idx
  on public.assistant_tool_runs (thread_id, created_at);

-- ── Action approvals ────────────────────────────────────────────────────────
-- The security boundary for every consequential action.

create table public.action_approvals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  thread_id         uuid references public.assistant_threads (id) on delete set null,

  /* Bound to the person who must approve — not merely "someone in the org". */
  requested_for     uuid not null references public.profiles (id) on delete cascade,
  decided_by        uuid references public.profiles (id) on delete set null,

  tool_name         text not null,
  arguments         jsonb not null,
  /* SHA-256 of the canonicalised arguments. Changing any argument produces a
     different fingerprint, which is how "if the arguments change, require new
     approval" is enforced rather than merely intended. */
  arguments_hash    text not null,

  /* What the operator is agreeing to, in plain language, plus the integration
     the write lands on. Approving a summary you cannot read is not consent. */
  summary           text not null,
  target_integration text,
  preview           jsonb not null default '{}'::jsonb,

  state             public.approval_state not null default 'pending',
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  executed_at       timestamptz,

  check (expires_at > created_at)
);

create index action_approvals_org_idx
  on public.action_approvals (organization_id, created_at desc);

-- At most one live approval per (user, tool, exact arguments). A second
-- identical request reuses the first rather than minting a parallel grant.
create unique index action_approvals_live_idx
  on public.action_approvals (requested_for, tool_name, arguments_hash)
  where state in ('pending', 'approved');

-- ── RLS ─────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'assistant_threads','assistant_messages','assistant_tool_runs','action_approvals'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($p$
      create policy %1$s_select on public.%1$I for select
      using (public.is_org_member(organization_id) or public.is_platform_staff())
    $p$, t);

    execute format($p$
      create policy %1$s_insert on public.%1$I for insert
      with check (public.has_org_role_at_least(organization_id, 'viewer'))
    $p$, t);
  end loop;
end;
$$;

-- Threads may be renamed or archived by their owner or an admin.
create policy assistant_threads_update on public.assistant_threads
  for update
  using (
    created_by = auth.uid()
    or public.has_org_role_at_least(organization_id, 'tenant_admin')
  )
  with check (
    created_by = auth.uid()
    or public.has_org_role_at_least(organization_id, 'tenant_admin')
  );

-- Messages and tool runs are append-only: no UPDATE or DELETE policy exists,
-- so a transcript cannot be quietly rewritten after the fact.

-- ── Deciding an approval ────────────────────────────────────────────────────
-- A definer function rather than an UPDATE policy, because the rules that
-- matter here (only the named person, only while pending, only before expiry,
-- always audited) are not expressible as a row predicate.

create or replace function public.decide_action_approval(
  approval uuid,
  approve boolean
)
returns public.approval_state
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.action_approvals%rowtype;
  next_state public.approval_state;
begin
  select * into row_data from public.action_approvals where id = approval;

  if row_data.id is null then
    raise exception 'Approval not found' using errcode = 'no_data_found';
  end if;

  -- Membership is necessary but not sufficient: the approval names one person.
  if not public.is_org_member(row_data.organization_id) then
    raise exception 'Approval not found' using errcode = 'no_data_found';
  end if;

  if row_data.requested_for <> auth.uid() then
    raise exception 'This approval was requested for someone else'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.has_org_role_at_least(row_data.organization_id, 'tenant_admin') then
    raise exception 'Approving an action requires the Admin role'
      using errcode = 'insufficient_privilege';
  end if;

  if row_data.state <> 'pending' then
    raise exception 'This approval has already been decided (%).', row_data.state
      using errcode = 'invalid_parameter_value';
  end if;

  if row_data.expires_at <= now() then
    update public.action_approvals set state = 'expired' where id = approval;
    raise exception 'This approval expired at %', row_data.expires_at
      using errcode = 'invalid_parameter_value';
  end if;

  next_state := case when approve then 'approved' else 'rejected' end;

  update public.action_approvals
  set state = next_state, decided_by = auth.uid(), decided_at = now()
  where id = approval;

  insert into public.audit_logs
    (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    row_data.organization_id,
    auth.uid(),
    case when approve then 'assistant.action_approved' else 'assistant.action_rejected' end,
    'action_approval',
    approval::text,
    jsonb_build_object(
      'tool', row_data.tool_name,
      'arguments_hash', row_data.arguments_hash,
      'summary', row_data.summary
    )
  );

  return next_state;
end;
$$;

revoke all on function public.decide_action_approval(uuid, boolean) from public, anon;
grant execute on function public.decide_action_approval(uuid, boolean) to authenticated;

-- ── What the write tools actually create ────────────────────────────────────
-- An approval gate with nothing behind it is theatre. These are the two
-- destinations the assistant's write tools land on, so the flow runs
-- end to end: propose → approve → execute → visible record.

create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by      uuid references public.profiles (id) on delete set null,
  title           text not null,
  metric_key      text not null,
  /* Minor units for money metrics, raw value otherwise — interpretation is
     the metric's, not this table's. */
  target_value    bigint not null,
  deadline        date not null,
  state           text not null default 'active' check (state in ('active', 'met', 'missed', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index goals_org_idx on public.goals (organization_id, deadline);

create trigger goals_touch
  before update on public.goals
  for each row execute function public.touch_updated_at();

create table public.notification_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by      uuid references public.profiles (id) on delete set null,
  name            text not null,
  metric_key      text not null,
  comparator      text not null check (comparator in ('above', 'below')),
  threshold       numeric not null,
  channel         text not null default 'in_app' check (channel in ('in_app', 'email')),
  enabled         boolean not null default true,
  last_fired_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index notification_rules_org_idx on public.notification_rules (organization_id);

create trigger notification_rules_touch
  before update on public.notification_rules
  for each row execute function public.touch_updated_at();

do $$
declare
  t text;
  tables text[] := array['goals', 'notification_rules'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($p$
      create policy %1$s_select on public.%1$I for select
      using (public.is_org_member(organization_id) or public.is_platform_staff())
    $p$, t);

    -- Creating either of these is a commercial decision, matching the
    -- capability the assistant requires to propose one.
    execute format($p$
      create policy %1$s_write on public.%1$I for all
      using (public.has_org_role_at_least(organization_id, 'tenant_admin'))
      with check (public.has_org_role_at_least(organization_id, 'tenant_admin'))
    $p$, t);
  end loop;
end;
$$;

-- ── Marking an approval executed ────────────────────────────────────────────
-- Separate from deciding it, and idempotent: the state transition is the
-- record that the action happened, so a retry must not double-execute.

create or replace function public.mark_approval_executed(approval uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  update public.action_approvals
  set state = 'executed', executed_at = now()
  where id = approval
    and state = 'approved'
    and expires_at > now()
    and requested_for = auth.uid()
    and public.is_org_member(organization_id);

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

revoke all on function public.mark_approval_executed(uuid) from public, anon;
grant execute on function public.mark_approval_executed(uuid) to authenticated;
