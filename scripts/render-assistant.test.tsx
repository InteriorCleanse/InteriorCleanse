/**
 * Render harness for the assistant surfaces.
 *
 * Not a test in spirit. Unit tests confirm the assistant's *logic*; they cannot
 * tell you that an approval card's values overflow their column, or that a
 * source chip row wraps into the send button. Those are the failures that
 * matter to someone deciding whether to spend money, so the components get
 * written to a static page and looked at.
 *
 * Real Tailwind classes and the real token stylesheet are used — a hand-written
 * CSS shim would verify the shim.
 */
import { describe, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import {
  AssistantEmptyState,
  AssistantTurn,
  ApprovalCard,
} from '@/components/assistant/AssistantDock'
import { BriefingPanel } from '@/components/assistant/BriefingPanel'
import { TOOLS_BY_NAME, type ToolContext } from '@/lib/assistant/tools'

const FUTURE = new Date(Date.now() + 8 * 60 * 1000).toISOString()
const CURRENCY = 'GBP'

const ctx: ToolContext = {
  organizationId: 'org-1',
  isDemo: true,
  currency: CURRENCY,
  can: () => true,
}

/**
 * Previews come from the real tools rather than being written out here — the
 * point of looking at this page is to see what the product produces, not what
 * the harness author imagined it produces.
 */
async function previewOf(toolName: string, args: unknown) {
  const tool = TOOLS_BY_NAME.get(toolName)!
  const result = await tool.execute(tool.schema.parse(args), ctx)
  return result.preview!
}

describe('assistant render harness', () => {
  it('writes assistant.html', async () => {
    const answer = {
      id: 'a1',
      role: 'assistant' as const,
      text: 'Contribution profit fell 7.4% over the last 30 days while net revenue rose 3.1%. The gap is almost entirely advertising: spend is up 41% and the extra orders came in at a lower margin than the base.\n\nAd spend of £24,180.00 could not be attributed to a product for £3,940.00 of that total, so per-product profit below is understated somewhere.',
      citations: ['net_revenue', 'contribution_profit', 'ad_spend', 'roas', 'data_quality'],
      tools: [
        { id: 't1', name: 'inspect_data_quality', ok: true },
        { id: 't2', name: 'query_kpis', ok: true },
        { id: 't3', name: 'analyze_profit_bridge', ok: true },
        { id: 't4', name: 'forecast_revenue', ok: false },
      ],
      approvals: [],
    }

    const proposal = {
      id: 'a2',
      role: 'assistant' as const,
      text: 'I can set an alert for that. Nothing has happened yet — approve the request below and it will be created.',
      tools: [{ id: 't5', name: 'create_notification_rule', ok: true }],
      approvals: [
        {
          id: 'ap1',
          toolName: 'create_notification_rule',
          expiresAt: FUTURE,
          ...(await previewOf('create_notification_rule', {
            name: 'Daily spend guard',
            metric: 'adSpend',
            comparator: 'above',
            threshold: 1000,
            channel: 'email',
          })),
        },
      ],
    }

    const decided = {
      ...proposal,
      id: 'a3',
      approvals: [
        {
          ...proposal.approvals[0]!,
          id: 'ap2',
          decision: 'approved' as const,
          outcome: 'Alert “Daily spend guard” created.',
        },
      ],
    }

    const dock = (children: React.ReactNode, label: string) => (
      <div>
        <p style={{ font: '600 12px system-ui', color: '#78716c', margin: '0 0 8px' }}>{label}</p>
        <aside className="flex h-[36rem] w-full max-w-md flex-col rounded-panel border border-hairline bg-panel shadow-panel">
          <header className="flex items-center gap-3 border-b border-hairline px-5 py-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">Aurelis</p>
              <p className="truncate text-xs text-muted">
                Northwind Supply Co · demonstration data
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-signal">Voice on</span>
              <span className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-muted">Close</span>
            </div>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
          <div className="flex items-end gap-2 border-t border-hairline px-5 py-3">
            <div className="max-h-32 min-h-11 flex-1 rounded-lg border border-hairline bg-ground px-3 py-2.5 text-sm text-muted">
              Ask about this workspace…
            </div>
            <span className="inline-flex min-h-11 items-center rounded-lg border border-hairline px-3 text-xs text-muted">
              Hold
            </span>
            <span className="inline-flex min-h-11 items-center rounded-lg bg-signal px-4 text-sm font-medium text-ground">
              Ask
            </span>
          </div>
        </aside>
      </div>
    )

    const body = renderToStaticMarkup(
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {dock(
            <AssistantEmptyState
              assistantName="Aurelis"
              configured
              onPick={() => {}}
            />,
            'Empty state — suggested commands',
          )}

          {dock(
            <>
              <p className="ml-8 rounded-lg bg-panelRaised px-3 py-2 text-sm text-ink">
                Why did profit fall even though revenue increased?
              </p>
              <AssistantTurn turn={answer} canApprove onDecide={() => {}} />
            </>,
            'Answer — tool timeline and source chips',
          )}

          {dock(
            <>
              <p className="ml-8 rounded-lg bg-panelRaised px-3 py-2 text-sm text-ink">
                Alert me if we spend more than a grand a day with ROAS under 2.
              </p>
              <AssistantTurn turn={proposal} canApprove onDecide={() => {}} />
            </>,
            'Approval pending',
          )}

          {dock(
            <>
              <AssistantTurn turn={decided} canApprove onDecide={() => {}} />
              <AssistantTurn
                turn={{
                  id: 'a4',
                  role: 'assistant',
                  text: 'The assistant could not finish that. Nothing was changed.',
                  failed: true,
                }}
                canApprove
                onDecide={() => {}}
              />
            </>,
            'Executed, and a failure',
          )}
        </div>

        <div className="max-w-md">
          <p style={{ font: '600 12px system-ui', color: '#78716c', margin: '0 0 8px' }}>
            Approval card — viewer without permission
          </p>
          <ApprovalCard
            approval={{
              id: 'ap3',
              toolName: 'create_goal',
              expiresAt: FUTURE,
              ...(await previewOf('create_goal', {
                title: 'Reach a quarter of a million in contribution profit this quarter',
                metric: 'contributionProfit',
                targetValue: 250000,
                deadline: '2026-06-30',
              })),
            }}
            canApprove={false}
            onDecide={() => {}}
          />
        </div>

        <BriefingPanel kind="weekly" isDemo currency={CURRENCY} />
        <BriefingPanel kind="morning" isDemo={false} currency={CURRENCY} />
      </div>,
    )

    writeFileSync(
      '/tmp/assistant-body.html',
      `<div class="min-h-screen bg-ground">${body}</div>`,
    )
  })
})
