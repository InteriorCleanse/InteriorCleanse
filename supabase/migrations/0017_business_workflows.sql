-- ============================================================================
-- AURELIS OS — a workflow for every product and brand business
--
-- An operator running several brands needs to know, for each one, where it
-- stands between "an idea with a name" and "a business that runs itself":
-- what is done, what is next, what is stuck and on whom. That is a list of
-- steps per workspace, grouped into stages, each with a status.
--
-- Steps start from a playbook defined in code (lib/workflow/template.ts) and
-- are copied into the workspace when the operator starts it, so a later
-- change to the playbook never rewrites a business's history. `template_key`
-- remembers which playbook step a row came from; it is unique per workspace,
-- so starting the playbook twice adds nothing. A step the operator adds
-- themselves has no key.
--
-- Who can do what follows the commerce tables: every member reads; members
-- and above move steps along, because the person doing the work is the one
-- who knows it is done; only an admin deletes, because deleting a step is
-- rewriting the plan rather than working it.
--
-- Completion is stamped by the database, not by the caller: `completed_at`
-- and `completed_by` are set when a step becomes done and cleared when it
-- stops being done, so "who finished this, and when" cannot be backdated
-- from a form.
-- ============================================================================

create table public.workflow_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stage           text not null
                    check (stage in ('foundation','brand','product','storefront','launch','growth','operations')),
  /* The playbook step this row was copied from; null for a step someone added. */
  template_key    text check (template_key is null or template_key ~ '^[a-z0-9-]{1,60}$'),
  title           text not null check (length(title) between 1 and 160),
  detail          text not null default '' check (length(detail) <= 2000),
  status          text not null default 'todo'
                    check (status in ('todo','doing','blocked','done','skipped')),
  /* Why it is stuck, in a sentence. Only meaningful while blocked. */
  blocked_reason  text check (blocked_reason is null or length(blocked_reason) <= 500),
  /* Free text: a supplier's name, a link, what was decided. */
  notes           text not null default '' check (length(notes) <= 4000),
  assignee_id     uuid references public.profiles (id) on delete set null,
  due_on          date,
  position        integer not null default 0,
  completed_at    timestamptz,
  completed_by    uuid references public.profiles (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A full unique index rather than a partial one, so NULL keys (custom
  -- steps) never collide and ON CONFLICT can infer it.
  unique (organization_id, template_key)
);

create index workflow_items_org_idx on public.workflow_items (organization_id, stage, position);
create index workflow_items_due_idx on public.workflow_items (organization_id, due_on)
  where status in ('todo','doing','blocked');

alter table public.workflow_items enable row level security;
alter table public.workflow_items force row level security;

create policy workflow_items_select on public.workflow_items
  for select using (public.is_org_member(organization_id) or public.is_platform_staff());

create policy workflow_items_insert on public.workflow_items
  for insert with check (public.has_org_role_at_least(organization_id, 'member'));

create policy workflow_items_update on public.workflow_items
  for update
  using (public.has_org_role_at_least(organization_id, 'member'))
  with check (public.has_org_role_at_least(organization_id, 'member'));

create policy workflow_items_delete on public.workflow_items
  for delete using (public.has_org_role_at_least(organization_id, 'tenant_admin'));

create trigger workflow_items_touch
  before update on public.workflow_items
  for each row execute function public.touch_updated_at();

-- Completion is the database's to record.
create or replace function public.workflow_items_stamp_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      -- Already done: an edit to the notes must not move the date.
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status <> 'blocked' then
    new.blocked_reason := null;
  end if;

  -- An organization never changes under a step; moving one between
  -- businesses would be a way to write into a workspace through another.
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'A workflow step cannot move between workspaces'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger workflow_items_stamp
  before insert or update on public.workflow_items
  for each row execute function public.workflow_items_stamp_completion();

comment on table public.workflow_items is
  'Per-workspace playbook: the steps from idea to a business that runs itself, each with a status.';
