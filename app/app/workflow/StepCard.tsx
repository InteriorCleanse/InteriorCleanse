'use client'

import { useRef, useState } from 'react'
import { STATUSES, STATUS_LABELS, type Status } from '@/lib/workflow/template'
import { deleteStep, updateStep } from './actions'

export type StepView = {
  id: string
  title: string
  detail: string
  status: Status
  dueOn: string | null
  blockedReason: string | null
  notes: string
  assigneeId: string | null
  completedAt: string | null
  custom: boolean
  overdue: boolean
}

const TONE: Record<Status, string> = {
  todo: 'border-hairline',
  doing: 'border-signal/50',
  blocked: 'border-negative/60',
  done: 'border-positive/40 opacity-80',
  skipped: 'border-hairline opacity-60',
}

const DOT: Record<Status, string> = {
  todo: 'bg-hairline',
  doing: 'bg-signal',
  blocked: 'bg-negative',
  done: 'bg-positive',
  skipped: 'bg-muted',
}

/**
 * One step. Changing its status saves at once; the rest — due date, who has
 * it, why it is stuck, notes — opens underneath and saves with the button.
 * A plain form underneath, so it still works with JavaScript off.
 */
export function StepCard({
  step,
  members,
  canEdit,
  canDelete,
}: {
  step: StepView
  members: { id: string; name: string }[]
  canEdit: boolean
  canDelete: boolean
}) {
  const form = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<Status>(step.status)
  const [open, setOpen] = useState(step.status === 'blocked' && !step.blockedReason)
  const assignee = members.find((m) => m.id === step.assigneeId)?.name ?? null

  return (
    <li id={`step-${step.id}`} className={`rounded-xl border bg-panelRaised/60 p-4 transition ${TONE[status]}`}>
      <form ref={form} action={updateStep}>
        <input type="hidden" name="id" value={step.id} />
        <div className="flex flex-wrap items-start gap-3">
          <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status]}`} />
          <div className="min-w-0 flex-1">
            <p className={`font-medium text-ink ${status === 'done' ? 'line-through decoration-positive/60' : ''}`}>
              {step.title}
              {step.custom ? <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-muted">added</span> : null}
            </p>
            <p className="mt-1 text-xs text-muted">
              {[
                assignee ? `With ${assignee}` : null,
                step.dueOn ? `${step.overdue ? 'Overdue since' : 'Due'} ${step.dueOn}` : null,
                status === 'done' && step.completedAt ? `Done ${step.completedAt.slice(0, 10)}` : null,
                status === 'blocked' && step.blockedReason ? `Blocked: ${step.blockedReason}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || ' '}
            </p>
          </div>

          <label className="sr-only" htmlFor={`status-${step.id}`}>
            Status of {step.title}
          </label>
          <select
            id={`status-${step.id}`}
            name="status"
            value={status}
            disabled={!canEdit}
            onChange={(e) => {
              const next = e.target.value as Status
              setStatus(next)
              // A block needs a reason before it is worth saving.
              if (next === 'blocked') {
                setOpen(true)
                return
              }
              requestAnimationFrame(() => form.current?.requestSubmit())
            }}
            className={`rounded-lg border bg-panel px-2 py-1.5 text-sm outline-none transition focus:border-signal ${
              step.overdue && status !== 'done' ? 'border-amber text-amber' : 'border-hairline text-ink'
            }`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`more-${step.id}`}
            className="text-xs text-signal hover:underline"
          >
            {open ? 'Less' : 'More'}
          </button>
        </div>

        <div id={`more-${step.id}`} hidden={!open} className="mt-4 space-y-3 border-t border-hairline/60 pt-4">
          {step.detail ? <p className="text-sm leading-relaxed text-muted">{step.detail}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted">
              Due
              <input
                type="date"
                name="dueOn"
                defaultValue={step.dueOn ?? ''}
                disabled={!canEdit}
                className="mt-1 w-full rounded-lg border border-hairline bg-panel px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-muted">
              Who has it
              <select
                name="assigneeId"
                defaultValue={step.assigneeId ?? ''}
                disabled={!canEdit}
                className="mt-1 w-full rounded-lg border border-hairline bg-panel px-2 py-1.5 text-sm text-ink"
              >
                <option value="">Nobody yet</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {status === 'blocked' ? (
            <label className="block text-xs text-muted">
              What is it waiting on?
              <input
                name="blockedReason"
                defaultValue={step.blockedReason ?? ''}
                maxLength={500}
                required
                placeholder="Supplier has not sent the second sample"
                className="mt-1 w-full rounded-lg border border-negative/40 bg-panel px-2 py-1.5 text-sm text-ink"
              />
            </label>
          ) : (
            <input type="hidden" name="blockedReason" value="" />
          )}

          <label className="block text-xs text-muted">
            Notes
            <textarea
              name="notes"
              defaultValue={step.notes}
              maxLength={4000}
              rows={3}
              disabled={!canEdit}
              placeholder="Supplier, quote, link, what was decided"
              className="mt-1 w-full rounded-lg border border-hairline bg-panel px-2 py-1.5 text-sm text-ink"
            />
          </label>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-signal px-4 text-sm font-medium text-ground transition hover:brightness-110"
              >
                Save step
              </button>
              {canDelete ? (
                <button
                  type="submit"
                  formAction={deleteStep}
                  formNoValidate
                  onClick={(e) => {
                    if (!window.confirm(`Remove “${step.title}” from this business's playbook?`)) e.preventDefault()
                  }}
                  className="text-xs text-negative hover:underline"
                >
                  Remove step
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>
    </li>
  )
}
