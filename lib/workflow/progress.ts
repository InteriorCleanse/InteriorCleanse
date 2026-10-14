import { STAGES, STAGE_LABELS, type Stage, type Status } from './template'

/**
 * Where a business stands on its playbook.
 *
 * Pure: rows in, a summary out. The workflow page, the Businesses hub, the
 * owner's mission control and the assistant all read this one function, so
 * "62% done, on Storefront, two blocked" means the same thing everywhere.
 *
 * Skipped steps leave the denominator: a digital brand that marks
 * "reorder points" not needed has not fallen behind on anything.
 */

export type WorkflowItem = {
  id: string
  stage: Stage
  title: string
  status: Status
  dueOn: string | null
  position: number
  blockedReason?: string | null
  assigneeId?: string | null
  templateKey?: string | null
}

export type WorkflowProgress = {
  started: boolean
  total: number
  done: number
  open: number
  blocked: number
  /** Done over everything not skipped, 0–100, rounded down so 100 means finished. */
  percent: number
  /** The earliest stage with an open step, or null when everything is finished. */
  currentStage: Stage | null
  currentStageLabel: string
  /** The next three open steps, in playbook order; blocked ones first in their stage. */
  nextUp: WorkflowItem[]
  overdue: WorkflowItem[]
  blockedItems: WorkflowItem[]
  perStage: { stage: Stage; label: string; total: number; done: number; open: number }[]
}

const OPEN: ReadonlySet<Status> = new Set<Status>(['todo', 'doing', 'blocked'])

export function isOpen(status: Status): boolean {
  return OPEN.has(status)
}

function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage)
}

/** Playbook order: stage, then blocked before doing before todo, then position. */
export function compareItems(a: WorkflowItem, b: WorkflowItem): number {
  const urgency = (s: Status) => (s === 'blocked' ? 0 : s === 'doing' ? 1 : 2)
  return (
    stageIndex(a.stage) - stageIndex(b.stage) ||
    urgency(a.status) - urgency(b.status) ||
    a.position - b.position ||
    a.title.localeCompare(b.title)
  )
}

export function progressOf(items: readonly WorkflowItem[], today: string): WorkflowProgress {
  const counted = items.filter((i) => i.status !== 'skipped')
  const done = counted.filter((i) => i.status === 'done').length
  const openItems = items.filter((i) => isOpen(i.status)).sort(compareItems)
  const currentStage = openItems[0]?.stage ?? null

  const perStage = STAGES.map((stage) => {
    const inStage = items.filter((i) => i.stage === stage && i.status !== 'skipped')
    return {
      stage,
      label: STAGE_LABELS[stage],
      total: inStage.length,
      done: inStage.filter((i) => i.status === 'done').length,
      open: inStage.filter((i) => isOpen(i.status)).length,
    }
  }).filter((s) => s.total > 0)

  return {
    started: items.length > 0,
    total: counted.length,
    done,
    open: openItems.length,
    blocked: openItems.filter((i) => i.status === 'blocked').length,
    percent: counted.length === 0 ? 0 : Math.floor((done / counted.length) * 100),
    currentStage,
    currentStageLabel: currentStage ? STAGE_LABELS[currentStage] : items.length > 0 ? 'Running' : 'Not started',
    nextUp: openItems.slice(0, 3),
    overdue: openItems.filter((i) => i.dueOn !== null && i.dueOn < today),
    blockedItems: openItems.filter((i) => i.status === 'blocked'),
    perStage,
  }
}

/** One line for a card or a briefing: "62% · Storefront · 2 blocked · 1 overdue". */
export function progressLine(p: WorkflowProgress): string {
  if (!p.started) return 'Playbook not started'
  if (p.open === 0) return 'Playbook complete'
  const parts = [`${p.percent}% done`, p.currentStageLabel]
  if (p.blocked > 0) parts.push(`${p.blocked} blocked`)
  if (p.overdue.length > 0) parts.push(`${p.overdue.length} overdue`)
  return parts.join(' · ')
}

/** Maps a database row to the shape above. */
export function itemFromRow(row: {
  id: string
  stage: string
  title: string
  status: string
  due_on: string | null
  position: number | null
  blocked_reason?: string | null
  assignee_id?: string | null
  template_key?: string | null
}): WorkflowItem {
  return {
    id: String(row.id),
    stage: (STAGES as readonly string[]).includes(row.stage) ? (row.stage as Stage) : 'operations',
    title: row.title,
    status: (['todo', 'doing', 'blocked', 'done', 'skipped'] as const).includes(row.status as Status)
      ? (row.status as Status)
      : 'todo',
    dueOn: row.due_on ? String(row.due_on).slice(0, 10) : null,
    position: Number(row.position ?? 0),
    blockedReason: row.blocked_reason ?? null,
    assigneeId: row.assignee_id ?? null,
    templateKey: row.template_key ?? null,
  }
}

/** Today's date in a zone, as YYYY-MM-DD, for "overdue". */
export function todayIn(timezone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/**
 * The compact form other screens and the assistant carry: enough to say
 * where a business stands and what is next, without the whole list.
 */
export type WorkflowSummary = {
  started: boolean
  percent: number
  stage: string
  blocked: number
  overdue: number
  line: string
  nextUp: string[]
  blockedSteps: { title: string; reason: string | null }[]
  overdueSteps: { title: string; dueOn: string }[]
}

export function summarise(progress: WorkflowProgress): WorkflowSummary {
  return {
    started: progress.started,
    percent: progress.percent,
    stage: progress.currentStageLabel,
    blocked: progress.blocked,
    overdue: progress.overdue.length,
    line: progressLine(progress),
    nextUp: progress.nextUp.map((i) => i.title),
    blockedSteps: progress.blockedItems.map((i) => ({ title: i.title, reason: i.blockedReason ?? null })),
    // Oldest first, so "the oldest overdue step" is the first one.
    overdueSteps: [...progress.overdue]
      .sort((a, b) => (a.dueOn as string).localeCompare(b.dueOn as string))
      .map((i) => ({ title: i.title, dueOn: i.dueOn as string })),
  }
}

/** Groups rows from several workspaces into a summary per workspace. */
export function summariseByWorkspace(
  rows: readonly (Parameters<typeof itemFromRow>[0] & { organization_id: string })[],
  todayFor: (organizationId: string) => string,
): Map<string, WorkflowSummary> {
  const grouped = new Map<string, WorkflowItem[]>()
  for (const row of rows) {
    const list = grouped.get(row.organization_id) ?? []
    list.push(itemFromRow(row))
    grouped.set(row.organization_id, list)
  }
  const out = new Map<string, WorkflowSummary>()
  for (const [org, items] of grouped) out.set(org, summarise(progressOf(items, todayFor(org))))
  return out
}

/** Whether a playbook has something only the owner can unstick. */
export function workflowNeedsYou(summary: WorkflowSummary | null | undefined): boolean {
  return Boolean(summary && (summary.blocked > 0 || summary.overdue > 0))
}
