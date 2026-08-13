'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { browserSpeechToText, browserTextToSpeech, speakable } from '@/lib/voice/browser'
import type { SpeechToTextSession } from '@/lib/voice/types'
import { SUGGESTED_COMMANDS } from '@/lib/assistant/tools'
import { describeExpiry } from '@/lib/assistant/approval'

/**
 * The assistant dock.
 *
 * A panel rather than a page, because the questions it answers are asked
 * *while* looking at a dashboard — "why did that fall?" only makes sense next
 * to the number that fell.
 *
 * Three things it deliberately does not do:
 *
 *   - It never renders a claim without its provenance. Source chips come from
 *     the tool results the answer was built from, so a figure can be traced.
 *   - It never lets an action happen by pressing enter. A write surfaces as a
 *     card with the exact values, and a second, explicit decision.
 *   - It never hides the tool calls. An analyst you cannot audit is a
 *     confident stranger.
 */

type Approval = {
  id: string
  toolName: string
  summary: string
  targetIntegration: string | null
  expiresAt: string
  fields: { label: string; value: string }[]
  decision?: 'approved' | 'rejected' | 'failed'
  outcome?: string
}

type ToolRun = { id: string; name: string; ok?: boolean; detail?: string }

type Turn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations?: string[]
  tools?: ToolRun[]
  approvals?: Approval[]
  failed?: boolean
}

type Props = {
  workspaceName: string
  isDemo: boolean
  canApproveActions: boolean
  assistantName: string
  configured: boolean
}

const METRIC_LABELS: Record<string, string> = {
  net_revenue: 'Net revenue',
  gross_sales: 'Gross sales',
  gross_profit: 'Gross profit',
  contribution_profit: 'Contribution profit',
  contribution_margin: 'Contribution margin',
  ad_spend: 'Ad spend',
  roas: 'ROAS',
  mer: 'MER',
  cac: 'CAC',
  aov: 'AOV',
  refund_rate: 'Refund rate',
  order_count: 'Orders',
  units_sold: 'Units',
  top_products: 'Product mix',
  data_quality: 'Data quality',
}

export function AssistantDock(props: Props) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<SpeechToTextSession | null>(null)
  const finalSpeechRef = useRef('')

  const voice = useMemo(
    () => ({ stt: browserSpeechToText.isAvailable(), tts: browserTextToSpeech.isAvailable() }),
    [],
  )

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [turns, open])

  // Closing tears down voice explicitly rather than in an effect: a synthesiser
  // that keeps talking after the panel is dismissed is alarming, and the
  // teardown belongs on the action that caused it, not on a re-render.
  const close = useCallback(() => {
    browserTextToSpeech.cancelAll()
    sessionRef.current?.abort()
    setListening(false)
    setOpen(false)
  }, [])

  // Escape closes it, because a panel that covers the screen on mobile needs a
  // way out that is not a small button.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const ask = useCallback(
    async (question: string, spoken: boolean) => {
      const text = question.trim()
      if (!text || busy) return

      setNotice(null)
      setDraft('')
      setBusy(true)

      const answerId = crypto.randomUUID()
      setTurns((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text },
        { id: answerId, role: 'assistant', text: '', tools: [], approvals: [] },
      ])

      const patch = (fn: (turn: Turn) => Turn) =>
        setTurns((prev) => prev.map((t) => (t.id === answerId ? fn(t) : t)))

      try {
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, threadId, voice: spoken && speakReplies }),
        })

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null)
          patch((t) => ({
            ...t,
            failed: true,
            text: payload?.error ?? 'The assistant is unavailable right now.',
          }))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue
            let event: Record<string, unknown>
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            switch (event.type) {
              case 'thread':
                setThreadId(event.threadId as string)
                break
              case 'text':
                patch((t) => ({ ...t, text: t.text + (event.text as string) }))
                break
              case 'tool_start':
                patch((t) => ({
                  ...t,
                  tools: [...(t.tools ?? []), { id: event.id as string, name: event.name as string }],
                }))
                break
              case 'tool_end':
                patch((t) => ({
                  ...t,
                  tools: (t.tools ?? []).map((run) =>
                    run.id === event.id
                      ? { ...run, ok: event.ok as boolean, detail: event.detail as string }
                      : run,
                  ),
                }))
                break
              case 'approval':
                patch((t) => ({
                  ...t,
                  approvals: [...(t.approvals ?? []), event.approval as Approval],
                }))
                break
              case 'done':
                patch((t) => ({ ...t, citations: event.citations as string[] }))
                break
              case 'error':
                patch((t) => ({ ...t, failed: true, text: event.message as string }))
                break
            }
          }
        }
      } catch {
        patch((t) => ({
          ...t,
          failed: true,
          text: 'The connection dropped mid-answer. Nothing was changed.',
        }))
      } finally {
        setBusy(false)
      }
    },
    [busy, speakReplies, threadId],
  )

  // Speaking is a separate effect from streaming: reading a half-finished
  // sentence aloud as it arrives is worse than a short pause.
  const lastTurn = turns[turns.length - 1]
  const lastComplete = !busy && lastTurn?.role === 'assistant' && !lastTurn.failed && lastTurn.text
  useEffect(() => {
    if (!speakReplies || !lastComplete || !voice.tts.available) return
    browserTextToSpeech.speak(speakable(lastComplete), {
      onError: (message) => setNotice(message),
    })
  }, [lastComplete, speakReplies, voice.tts.available])

  const startListening = () => {
    if (!voice.stt.available) {
      setNotice(voice.stt.available ? null : voice.stt.reason)
      return
    }
    finalSpeechRef.current = ''
    setListening(true)
    setNotice(null)

    sessionRef.current = browserSpeechToText.start({
      onChunk: (chunk) => {
        if (chunk.isFinal) finalSpeechRef.current += chunk.text
        // Interim text is shown in the box so the person can see it is hearing
        // them, but only final text is ever sent.
        setDraft(`${finalSpeechRef.current}${chunk.isFinal ? '' : chunk.text}`.trimStart())
      },
      onError: (message) => setNotice(message),
      onEnd: () => {
        setListening(false)
        const heard = finalSpeechRef.current.trim()
        finalSpeechRef.current = ''
        if (heard) void ask(heard, true)
      },
    })
  }

  const stopListening = () => sessionRef.current?.stop()

  const decide = async (turnId: string, approvalId: string, approve: boolean) => {
    const response = await fetch('/api/assistant/approvals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId, approve }),
    })
    const payload = await response.json().catch(() => null)

    setTurns((prev) =>
      prev.map((turn) =>
        turn.id !== turnId
          ? turn
          : {
              ...turn,
              approvals: (turn.approvals ?? []).map((a) =>
                a.id !== approvalId
                  ? a
                  : {
                      ...a,
                      decision: !response.ok ? 'failed' : approve ? 'approved' : 'rejected',
                      outcome: response.ok
                        ? (payload?.message ?? 'Done.')
                        : (payload?.error ?? 'That could not be completed.'),
                    },
              ),
            },
      ),
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-panelRaised px-5 text-sm font-medium text-ink shadow-panel transition hover:border-signal"
        aria-label={`Ask ${props.assistantName}`}
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
        Ask {props.assistantName}
      </button>
    )
  }

  return (
    <aside
      className="fixed bottom-0 right-0 z-40 flex h-[min(80vh,44rem)] w-full max-w-md flex-col border-l border-t border-hairline bg-panel shadow-panel sm:bottom-6 sm:right-6 sm:rounded-panel sm:border"
      aria-label={`${props.assistantName} assistant`}
    >
      <header className="flex items-center gap-3 border-b border-hairline px-5 py-3">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{props.assistantName}</p>
          <p className="truncate text-xs text-muted">
            {props.workspaceName}
            {props.isDemo ? ' · demonstration data' : ''}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {voice.tts.available ? (
            <button
              type="button"
              onClick={() => {
                browserTextToSpeech.cancelAll()
                setSpeakReplies((v) => !v)
              }}
              aria-pressed={speakReplies}
              title={speakReplies ? 'Replies are read aloud' : 'Replies are not read aloud'}
              className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs transition ${
                speakReplies ? 'text-signal' : 'text-muted hover:text-ink'
              }`}
            >
              {speakReplies ? 'Voice on' : 'Voice off'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-muted transition hover:text-ink"
            aria-label="Close assistant"
          >
            Close
          </button>
        </div>
      </header>

      <div ref={transcriptRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {turns.length === 0 ? (
          <AssistantEmptyState
            assistantName={props.assistantName}
            configured={props.configured}
            onPick={(command) => void ask(command, false)}
          />
        ) : null}

        {turns.map((turn) => (
          <AssistantTurn
            key={turn.id}
            turn={turn}
            canApprove={props.canApproveActions}
            onDecide={(approvalId, approve) => void decide(turn.id, approvalId, approve)}
          />
        ))}

        {busy && lastTurn?.role === 'assistant' && !lastTurn.text ? (
          <p className="text-sm text-muted">Thinking…</p>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="border-t border-hairline px-5 py-2 text-xs text-amber">
          {notice}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-hairline px-5 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          void ask(draft, false)
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Ask a question
        </label>
        <textarea
          id="assistant-input"
          rows={1}
          value={draft}
          disabled={!props.configured}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void ask(draft, false)
            }
          }}
          placeholder={props.configured ? 'Ask about this workspace…' : 'Assistant not configured'}
          className="max-h-32 min-h-11 flex-1 resize-y rounded-lg border border-hairline bg-ground px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-signal focus:outline-none disabled:opacity-50"
        />

        {voice.stt.available ? (
          <button
            type="button"
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={() => listening && stopListening()}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={busy || !props.configured}
            aria-pressed={listening}
            title="Hold to speak"
            className={`min-h-11 rounded-lg border px-3 text-xs transition disabled:opacity-50 ${
              listening
                ? 'border-signal bg-signal/10 text-signal'
                : 'border-hairline text-muted hover:text-ink'
            }`}
          >
            {listening ? 'Listening' : 'Hold'}
          </button>
        ) : null}

        <button
          type="submit"
          disabled={busy || !draft.trim() || !props.configured}
          className="min-h-11 rounded-lg bg-signal px-4 text-sm font-medium text-ground transition hover:brightness-110 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </aside>
  )
}

export function AssistantEmptyState({
  assistantName,
  configured,
  onPick,
}: {
  assistantName: string
  configured: boolean
  onPick: (command: string) => void
}) {
  if (!configured) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink">{assistantName} is not configured on this deployment.</p>
        <p className="text-sm text-muted">
          Set <code className="text-ink">ANTHROPIC_API_KEY</code> to enable it. Dashboards, imports
          and briefings work without it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {assistantName} answers from this workspace&rsquo;s own figures and shows where each one
        came from. Try:
      </p>
      <ul className="space-y-2">
        {SUGGESTED_COMMANDS.map((command) => (
          <li key={command}>
            <button
              type="button"
              onClick={() => onPick(command)}
              className="w-full rounded-lg border border-hairline bg-panelRaised px-3 py-2 text-left text-sm text-ink transition hover:border-signal"
            >
              {command}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AssistantTurn({
  turn,
  canApprove,
  onDecide,
}: {
  turn: Turn
  canApprove: boolean
  onDecide: (approvalId: string, approve: boolean) => void
}) {
  if (turn.role === 'user') {
    return (
      <p className="ml-8 rounded-lg bg-panelRaised px-3 py-2 text-sm text-ink">{turn.text}</p>
    )
  }

  return (
    <div className="space-y-2">
      {turn.tools && turn.tools.length > 0 ? (
        <ol className="space-y-1">
          {turn.tools.map((run) => (
            <li key={run.id} className="flex items-baseline gap-2 text-xs text-muted">
              <span
                aria-hidden="true"
                className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${
                  run.ok === undefined
                    ? 'bg-muted'
                    : run.ok
                      ? 'bg-positive'
                      : 'bg-negative'
                }`}
              />
              <span>
                {humanTool(run.name)}
                {run.ok === false ? ' — failed' : ''}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p
        className={`whitespace-pre-wrap text-sm ${turn.failed ? 'text-amber' : 'text-ink'}`}
      >
        {turn.text}
      </p>

      {turn.citations && turn.citations.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Sources for this answer">
          {turn.citations.map((key) => (
            <li
              key={key}
              className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted"
            >
              {METRIC_LABELS[key] ?? key}
            </li>
          ))}
        </ul>
      ) : null}

      {(turn.approvals ?? []).map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          canApprove={canApprove}
          onDecide={onDecide}
        />
      ))}
    </div>
  )
}

export function ApprovalCard({
  approval,
  canApprove,
  onDecide,
}: {
  approval: Approval
  canApprove: boolean
  onDecide: (approvalId: string, approve: boolean) => void
}) {
  const [remaining, setRemaining] = useState(() =>
    describeExpiry(new Date(approval.expiresAt)),
  )

  // The countdown is the point: an approval that sat on screen for an hour is
  // not consent to act now, and the card should say so before the click does.
  useEffect(() => {
    if (approval.decision) return
    const id = setInterval(
      () => setRemaining(describeExpiry(new Date(approval.expiresAt))),
      1_000,
    )
    return () => clearInterval(id)
  }, [approval.expiresAt, approval.decision])

  const expired = remaining === 'expired'

  return (
    <section className="rounded-lg border border-amber/40 bg-panelRaised p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber">
        Needs your approval
      </p>
      <p className="mt-1.5 text-sm text-ink">{approval.summary}</p>

      {approval.fields.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {approval.fields.map((field) => (
            <div key={field.label} className="contents">
              <dt className="text-muted">{field.label}</dt>
              <dd className="break-words text-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {approval.targetIntegration ? (
        <p className="mt-2 text-xs text-muted">
          Leaves this workspace via{' '}
          <span className="text-ink">{approval.targetIntegration}</span>.
        </p>
      ) : null}

      {approval.decision ? (
        <p
          className={`mt-3 text-xs ${
            approval.decision === 'failed' ? 'text-amber' : 'text-muted'
          }`}
        >
          {approval.outcome}
        </p>
      ) : !canApprove ? (
        <p className="mt-3 text-xs text-muted">
          Your role cannot approve actions. A workspace admin needs to.
        </p>
      ) : expired ? (
        <p className="mt-3 text-xs text-muted">This request expired. Ask again.</p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDecide(approval.id, true)}
            className="min-h-9 rounded-lg bg-signal px-3 text-xs font-medium text-ground transition hover:brightness-110"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onDecide(approval.id, false)}
            className="min-h-9 rounded-lg border border-hairline px-3 text-xs text-muted transition hover:text-ink"
          >
            Decline
          </button>
          <span className="text-xs text-muted">Expires in {remaining}</span>
        </div>
      )}
    </section>
  )
}

const TOOL_LABELS: Record<string, string> = {
  query_kpis: 'Read the headline metrics',
  compare_periods: 'Compared periods',
  rank_products: 'Ranked products',
  analyze_profit_bridge: 'Broke revenue down to profit',
  inspect_data_quality: 'Checked data quality',
  get_metric_definition: 'Looked up a definition',
  forecast_revenue: 'Projected revenue',
  create_goal: 'Proposed a goal',
  create_notification_rule: 'Proposed an alert',
}

function humanTool(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
