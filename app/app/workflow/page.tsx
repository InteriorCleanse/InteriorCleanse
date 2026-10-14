import Link from 'next/link'
import { Button, Eyebrow, Panel, inputClass } from '@/components/ui'
import { can } from '@/lib/authz'
import { requireMembership } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { itemFromRow, progressOf, todayIn } from '@/lib/workflow/progress'
import {
  BRAND_KIND_LABELS,
  STAGES,
  STAGE_LABELS,
  STAGE_PURPOSE,
  STATUS_LABELS,
  kindForBusinessType,
  stepsFor,
  type BrandKind,
} from '@/lib/workflow/template'
import { addStep, startPlaybook } from './actions'
import { StepCard, type StepView } from './StepCard'

export const metadata = { title: 'Workflow' }

/**
 * The business's playbook: every step from a name to a brand that runs
 * itself, grouped into stages, each with a status, an owner and a date.
 * Read through the person's own client, so RLS decides what is here.
 */
export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; welcome?: string }>
}) {
  const [{ membership, actor }, params] = await Promise.all([requireMembership(), searchParams])
  const canEdit = can(actor, 'workflow:edit')
  const canDelete = can(actor, 'workflow:manage')
  const supabase = await supabaseServer()

  const [{ data: org }, { data: rows }, { data: memberRows }] = await Promise.all([
    supabase.from('organizations').select('business_type').eq('id', membership.organizationId).maybeSingle(),
    supabase
      .from('workflow_items')
      .select(
        'id, stage, template_key, title, detail, status, blocked_reason, notes, assignee_id, due_on, position, completed_at',
      )
      .eq('organization_id', membership.organizationId)
      .order('position', { ascending: true })
      .limit(500),
    supabase
      .from('organization_members')
      .select('user_id, profiles(full_name, email)')
      .eq('organization_id', membership.organizationId)
      .eq('status', 'active'),
  ])

  const today = todayIn(membership.timezone)
  const items = (rows ?? []).map(itemFromRow)
  const progress = progressOf(items, today)
  const overdueIds = new Set(progress.overdue.map((i) => i.id))
  const defaultKind: BrandKind = kindForBusinessType(org?.business_type as string | null)

  const members = (memberRows ?? []).map((m) => {
    const profile = m.profiles as unknown as { full_name?: string | null; email?: string | null } | null
    return { id: String(m.user_id), name: profile?.full_name || profile?.email || 'A member' }
  })

  const views = new Map<string, StepView>(
    (rows ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        title: row.title,
        detail: row.detail ?? '',
        status: itemFromRow(row).status,
        dueOn: row.due_on ? String(row.due_on).slice(0, 10) : null,
        blockedReason: row.blocked_reason ?? null,
        notes: row.notes ?? '',
        assigneeId: row.assignee_id ?? null,
        completedAt: row.completed_at ? String(row.completed_at) : null,
        custom: row.template_key === null,
        overdue: overdueIds.has(String(row.id)),
      },
    ]),
  )

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Workflow</Eyebrow>
        <h1 className="text-3xl font-semibold">
          <span className="text-glow">{membership.name}</span>, from name to a business that runs itself
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          The product and brand playbook: {STAGES.length} stages, each a short list of steps with a status,
          an owner and a date. Every business you run gets its own copy, and your agent can read it.
        </p>
      </header>

      {params.notice ? (
        <p role="status" className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-ink">
          {params.notice}
        </p>
      ) : null}

      {!progress.started ? (
        <StartPanel defaultKind={defaultKind} canEdit={canEdit} welcome={params.welcome === '1'} />
      ) : (
        <>
          <Overview progress={progress} />

          {STAGES.map((stage) => {
            const inStage = items.filter((i) => i.stage === stage)
            const counts = progress.perStage.find((s) => s.stage === stage)
            return (
              <section key={stage} id={`stage-${stage}`} aria-labelledby={`h-${stage}`}>
                <Panel>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={`h-${stage}`} className="text-lg font-semibold">
                      {STAGE_LABELS[stage]}
                      {progress.currentStage === stage ? (
                        <span className="ml-2 rounded-full bg-signal/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-signal">
                          You are here
                        </span>
                      ) : null}
                    </h2>
                    <p className="tabular text-xs text-muted">
                      {counts ? `${counts.done} of ${counts.total} done` : 'No steps'}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted">{STAGE_PURPOSE[stage]}</p>

                  {inStage.length > 0 ? (
                    <ol className="mt-4 space-y-3">
                      {inStage.map((item) => {
                        const view = views.get(item.id)
                        return view ? (
                          <StepCard
                            key={item.id}
                            step={view}
                            members={members}
                            canEdit={canEdit}
                            canDelete={canDelete}
                          />
                        ) : null
                      })}
                    </ol>
                  ) : null}

                  {canEdit ? (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-signal">Add a step to {STAGE_LABELS[stage]}</summary>
                      <form action={addStep} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                        <input type="hidden" name="stage" value={stage} />
                        <input
                          name="title"
                          required
                          maxLength={160}
                          placeholder="What needs doing"
                          className={inputClass}
                        />
                        <Button type="submit" variant="secondary">
                          Add
                        </Button>
                        <textarea
                          name="detail"
                          maxLength={2000}
                          rows={2}
                          placeholder="Why it matters, or how to do it (optional)"
                          className={`${inputClass} sm:col-span-2`}
                        />
                      </form>
                    </details>
                  ) : null}
                </Panel>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}

function Overview({ progress }: { progress: ReturnType<typeof progressOf> }) {
  return (
    <Panel>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <span
              className="health-ring"
              style={{ width: 88, height: 88, ['--pct' as string]: Math.max(progress.percent, 2) }}
              aria-hidden="true"
            />
            <span className="tabular absolute inset-0 grid place-items-center text-lg font-semibold">
              {progress.percent}%
            </span>
          </div>
          <div>
            <p className="text-sm text-muted">On</p>
            <p className="text-xl font-semibold">{progress.currentStageLabel}</p>
            <p className="tabular mt-1 text-xs text-muted">
              {progress.done} of {progress.total} steps done
              {progress.blocked > 0 ? ` · ${progress.blocked} blocked` : ''}
              {progress.overdue.length > 0 ? ` · ${progress.overdue.length} overdue` : ''}
            </p>
          </div>
        </div>

        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Stages">
          {progress.perStage.map((s) => {
            const pct = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100)
            return (
              <li key={s.stage}>
                <a
                  href={`#stage-${s.stage}`}
                  className={`block rounded-lg border px-3 py-2 transition hover:border-signal ${
                    progress.currentStage === s.stage ? 'border-signal/60 bg-signal/5' : 'border-hairline'
                  }`}
                >
                  <span className="block text-xs font-medium">{s.label}</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-hairline">
                    <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="tabular mt-1 block text-[11px] text-muted">
                    {s.done}/{s.total}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      </div>

      {progress.nextUp.length > 0 ? (
        <div className="mt-6 border-t border-hairline/60 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Next up</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {progress.nextUp.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-2">
                <a href={`#step-${item.id}`} className="text-ink hover:text-signal">
                  {item.title}
                </a>
                <span className="text-xs text-muted">
                  {STAGE_LABELS[item.stage]} · {STATUS_LABELS[item.status]}
                  {item.status === 'blocked' && item.blockedReason ? ` — ${item.blockedReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 border-t border-hairline/60 pt-4 text-sm text-positive">
          Every step is done or set aside. Keep the operations routines running and review weekly.
        </p>
      )}
    </Panel>
  )
}

function StartPanel({ defaultKind, canEdit, welcome }: { defaultKind: BrandKind; canEdit: boolean; welcome: boolean }) {
  const kinds: BrandKind[] = ['physical', 'digital']
  return (
    <>
      <Panel className={welcome ? 'border-signal/50' : ''}>
        <Eyebrow>{welcome ? 'Your new business is ready' : 'Not started'}</Eyebrow>
        <h2 className="text-xl font-semibold">Start the product and brand playbook</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          It copies the steps into this business so you can work them, assign them and date them. Steps that
          do not apply to what you sell are left out; anything else you can mark “Not needed”. Starting twice
          adds nothing.
        </p>
        {canEdit ? (
          <form action={startPlaybook} className="mt-5 space-y-4">
            <fieldset className="flex flex-wrap gap-3">
              <legend className="mb-2 text-sm font-medium">What does this business sell?</legend>
              {kinds.map((kind) => (
                <label
                  key={kind}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-panelRaised px-4 text-sm has-[:checked]:border-signal has-[:checked]:bg-signal/10"
                >
                  <input type="radio" name="kind" value={kind} defaultChecked={kind === defaultKind} />
                  {BRAND_KIND_LABELS[kind]}
                  <span className="tabular text-xs text-muted">{stepsFor(kind).length} steps</span>
                </label>
              ))}
            </fieldset>
            <Button type="submit">Start the playbook</Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-amber">Ask a member or admin of this business to start it.</p>
        )}
      </Panel>

      <ol className="grid gap-4 md:grid-cols-2">
        {STAGES.map((stage, i) => (
          <li key={stage}>
            <Panel>
              <p className="tabular text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                Stage {i + 1}
              </p>
              <h3 className="mt-1 font-semibold">{STAGE_LABELS[stage]}</h3>
              <p className="mt-1 text-sm text-muted">{STAGE_PURPOSE[stage]}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {stepsFor(defaultKind)
                  .filter((s) => s.stage === stage)
                  .map((s) => (
                    <li key={s.key}>· {s.title}</li>
                  ))}
              </ul>
            </Panel>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted">
        Running several businesses? Each one has its own playbook. See them side by side on{' '}
        <Link href="/app/businesses" className="text-signal hover:underline">
          Businesses
        </Link>
        .
      </p>
    </>
  )
}
