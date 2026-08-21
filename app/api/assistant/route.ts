import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { assistantEnv, isAssistantConfigured } from '@/lib/env'
import { can } from '@/lib/authz'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { APPROVAL_TTL_MS, fingerprint } from '@/lib/assistant/approval'
import { VOICE_ADDENDUM, systemPrompt } from '@/lib/assistant/prompt'
import { redactSecrets, sanitiseToolResult, wrapExternal } from '@/lib/assistant/sanitise'
import { TOOLS, TOOLS_BY_NAME, type ToolContext } from '@/lib/assistant/tools'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit'

/**
 * The assistant endpoint.
 *
 * Streams newline-delimited JSON rather than SSE: the client is our own dock,
 * not an EventSource, and NDJSON survives a proxy that buffers `text/event-stream`
 * without the reconnection semantics we do not want here anyway.
 *
 * The shape of the loop is deliberate:
 *
 *   - Read tools execute immediately; their results are sanitised before they
 *     reach the model, because they contain product names and customer notes
 *     that an attacker may control.
 *   - Write tools never execute here. They raise an approval bound to the exact
 *     arguments and return "awaiting approval" to the model, so a successful
 *     injection can at most cause a request a human then declines.
 *   - The organization is resolved from the session's memberships. There is no
 *     path by which a request body names a workspace.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_TURNS = 8

const requestSchema = z.object({
  message: z.string().min(1).max(4_000),
  threadId: z.string().uuid().optional(),
  /** Client hint that the reply will be spoken; changes formatting only. */
  voice: z.boolean().default(false),
  /** Validated against memberships — never trusted as a scope. */
  organizationId: z.string().uuid().optional(),
})

type Event =
  | { type: 'thread'; threadId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: unknown }
  | { type: 'tool_end'; id: string; ok: boolean; citations: string[]; detail?: string }
  | {
      type: 'approval'
      approval: {
        id: string
        toolName: string
        summary: string
        targetIntegration: string | null
        expiresAt: string
        fields: { label: string; value: string }[]
      }
    }
  | { type: 'done'; citations: string[] }
  | { type: 'error'; message: string }

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) {
    return Response.json({ error: 'Sign in to use the assistant.' }, { status: 401 })
  }

  if (!isAssistantConfigured()) {
    return Response.json(
      {
        error:
          'The assistant is not configured on this deployment. Set ANTHROPIC_API_KEY. Dashboards, imports and briefings work without it.',
      },
      { status: 503 },
    )
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Malformed request.' }, { status: 400 })
  }
  const body = parsed.data

  // Scope resolution: a client-supplied id is matched against memberships and
  // discarded if absent. An id from another tenant is indistinguishable from
  // one that does not exist.
  const membership = body.organizationId
    ? session.memberships.find((m) => m.organizationId === body.organizationId)
    : session.memberships[0]

  if (!membership) {
    return Response.json({ error: 'No workspace available.' }, { status: 403 })
  }

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }

  if (!can(actor, 'assistant:query')) {
    return Response.json(
      { error: 'Your role does not include using the assistant.' },
      { status: 403 },
    )
  }

  // Rate limiting happens after authorization and before the model call: this
  // is the most expensive request in the product, and until it is metered per
  // tenant the difference between a bug and a bill is nothing but goodwill.
  // Keyed on the resolved workspace and user — both from the session, never
  // from a header a caller could choose.
  for (const policy of ['assistant', 'assistantDaily'] as const) {
    const limit = await rateLimit({
      key: limitKey(policy, membership.organizationId, session.userId),
      policy,
    })
    if (!limit.allowed) {
      return Response.json(
        {
          error:
            policy === 'assistant'
              ? `That is a lot of questions at once. Try again in ${limit.retryAfterSeconds} seconds.`
              : 'This workspace has reached its assistant limit for today. It resets gradually through the day.',
        },
        { status: 429, headers: rateLimitHeaders(limit) },
      )
    }
  }

  const env = assistantEnv()
  const supabase = await supabaseServer()
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  // Thread: reuse when the client supplies one it can see (RLS decides that),
  // otherwise open a new one titled from the first thing asked.
  let threadId = body.threadId ?? null
  if (threadId) {
    const { data } = await supabase
      .from('assistant_threads')
      .select('id')
      .eq('id', threadId)
      .eq('organization_id', membership.organizationId)
      .maybeSingle()
    if (!data) threadId = null
  }
  if (!threadId) {
    const { data, error } = await supabase
      .from('assistant_threads')
      .insert({
        organization_id: membership.organizationId,
        created_by: session.userId,
        title: body.message.slice(0, 80),
      })
      .select('id')
      .single()
    if (error || !data) {
      return Response.json({ error: 'Could not start a conversation.' }, { status: 500 })
    }
    threadId = data.id as string
  }
  if (!threadId) {
    return Response.json({ error: 'Could not start a conversation.' }, { status: 500 })
  }
  const thread: string = threadId

  // Prior turns, oldest first. Bounded because an unbounded transcript is both
  // a cost problem and a place for stale instructions to accumulate.
  const { data: history } = await supabase
    .from('assistant_messages')
    .select('role, content, created_at')
    .eq('thread_id', thread)
    .order('created_at', { ascending: false })
    .limit(20)

  const priorTurns: Anthropic.MessageParam[] = (history ?? [])
    .reverse()
    .filter((m): m is { role: 'user' | 'assistant'; content: string; created_at: string } =>
      m.role === 'user' || m.role === 'assistant',
    )
    .map((m) => ({ role: m.role, content: m.content }))

  await supabase.from('assistant_messages').insert({
    organization_id: membership.organizationId,
    thread_id: thread,
    role: 'user',
    content: body.message,
  })

  // Metered for the billing page and the owner console's cost-per-tenant view.
  // Recorded on acceptance rather than on success: a request that failed
  // halfway still spent tokens at the provider.
  await supabase.rpc('record_usage', {
    org: membership.organizationId,
    usage_kind: 'assistant_message',
    qty: 1,
  })

  const toolContext: ToolContext = {
    organizationId: membership.organizationId,
    isDemo: membership.isDemo,
    currency: membership.baseCurrency,
    can: (capability) => can(actor, capability),
  }

  const system =
    systemPrompt({
      workspaceName: membership.name,
      currency: toolContext.currency,
      isDemo: membership.isDemo,
      userName: session.fullName,
      tenantRole: membership.role,
      canApproveActions: can(actor, 'assistant:approve_action'),
      today: new Date().toISOString().slice(0, 10),
    }) + (body.voice ? VOICE_ADDENDUM : '')

  // Only tools the caller's role permits are advertised. A tool the model
  // cannot see is a tool it cannot be talked into calling.
  const available = TOOLS.filter((t) => can(actor, t.capability))
  const toolDefs: Anthropic.Tool[] = available.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.schema, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    }) as Anthropic.Tool.InputSchema,
  }))

  const encoder = new TextEncoder()
  const messages: Anthropic.MessageParam[] = [...priorTurns, { role: 'user', content: body.message }]

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

      const citations = new Set<string>()
      let answer = ''

      send({ type: 'thread', threadId: thread })

      try {
        for (let turn = 0; turn < MAX_TURNS; turn += 1) {
          const modelStream = anthropic.messages.stream({
            model: env.ASSISTANT_MODEL,
            max_tokens: env.ASSISTANT_MAX_TOKENS,
            // Adaptive thinking at medium effort: enough deliberation to pick
            // the right tool and read a result honestly, without spending a
            // paragraph of reasoning on "what was revenue".
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            system,
            tools: toolDefs,
            messages,
          })

          for await (const event of modelStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              const text = redactSecrets(event.delta.text)
              answer += text
              send({ type: 'text', text })
            }
          }

          const message = await modelStream.finalMessage()
          messages.push({ role: 'assistant', content: message.content })

          if (message.stop_reason !== 'tool_use') break

          const calls = message.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
          )
          if (calls.length === 0) break

          const results: Anthropic.ToolResultBlockParam[] = []

          for (const call of calls) {
            const outcome = await runTool({
              call,
              supabase,
              toolContext,
              actor,
              threadId: thread,
              canApprove: can(actor, 'assistant:approve_action'),
            })

            for (const citation of outcome.citations) citations.add(citation)
            send({
              type: 'tool_start',
              id: call.id,
              name: call.name,
              args: call.input,
            })
            send({
              type: 'tool_end',
              id: call.id,
              ok: !outcome.isError,
              citations: outcome.citations,
              detail: outcome.detail,
            })
            if (outcome.approval) send({ type: 'approval', approval: outcome.approval })

            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: outcome.content,
              is_error: outcome.isError,
            })
          }

          messages.push({ role: 'user', content: results })
        }

        const cited = Array.from(citations)

        await supabase.from('assistant_messages').insert({
          organization_id: membership.organizationId,
          thread_id: thread,
          role: 'assistant',
          content: answer,
          citations: cited,
          model: env.ASSISTANT_MODEL,
        })

        send({ type: 'done', citations: cited })
      } catch (error) {
        // The model's own error text can echo request content; never forward it.
        console.error('assistant stream failed', error)
        send({
          type: 'error',
          message: 'The assistant could not finish that. Nothing was changed.',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // The dock reads this incrementally; a proxy buffering it would make the
      // assistant look hung for the length of a whole answer.
      'x-accel-buffering': 'no',
    },
  })
}

type ToolOutcome = {
  content: string
  isError: boolean
  citations: string[]
  detail?: string
  approval?: Extract<Event, { type: 'approval' }>['approval']
}

/**
 * Runs one tool call, or converts it into an approval request.
 *
 * Every failure path returns a tool_result rather than throwing: the model
 * needs to see that a tool failed so it can say so, and an exception here
 * would abandon a half-written answer.
 */
async function runTool(input: {
  call: Anthropic.ToolUseBlock
  supabase: Awaited<ReturnType<typeof supabaseServer>>
  toolContext: ToolContext
  actor: { userId: string }
  threadId: string
  canApprove: boolean
}): Promise<ToolOutcome> {
  const { call, supabase, toolContext } = input
  const started = Date.now()
  const tool = TOOLS_BY_NAME.get(call.name)

  const record = async (status: 'ok' | 'error' | 'blocked', error?: string) => {
    await supabase.from('assistant_tool_runs').insert({
      organization_id: toolContext.organizationId,
      thread_id: input.threadId,
      tool_name: call.name,
      arguments: call.input ?? {},
      status,
      error: error ?? null,
      duration_ms: Date.now() - started,
    })
  }

  if (!tool || !toolContext.can(tool.capability)) {
    await record('blocked', 'unknown or not permitted')
    return {
      content: 'That tool is not available in this workspace.',
      isError: true,
      citations: [],
    }
  }

  const parsed = tool.schema.safeParse(call.input)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
    await record('error', detail.join('; '))
    return {
      content: `Invalid arguments — ${detail.join('; ')}. Correct them and call the tool again.`,
      isError: true,
      citations: [],
    }
  }

  try {
    const result = await tool.execute(parsed.data, toolContext)

    if (tool.kind === 'write') {
      const approval = await raiseApproval({
        supabase,
        toolName: tool.name,
        args: parsed.data,
        preview: result.preview,
        organizationId: toolContext.organizationId,
        userId: input.actor.userId,
        threadId: input.threadId,
      })

      if (!approval) {
        await record('error', 'approval could not be raised')
        return {
          content: 'The approval request could not be created, so nothing was proposed.',
          isError: true,
          citations: [],
        }
      }

      await record('blocked', 'awaiting approval')
      return {
        content: input.canApprove
          ? `Nothing has happened yet. An approval request was raised: “${approval.summary}”. Tell the person what you are proposing and that they need to approve it. Do not claim it is done.`
          : `Nothing has happened yet. An approval request was raised: “${approval.summary}”. This person cannot approve actions — tell them a workspace admin must.`,
        isError: false,
        citations: [],
        detail: approval.summary,
        approval,
      }
    }

    await record('ok')
    // Everything a read tool returns is external content as far as the model
    // is concerned, including our own product names.
    const safe = sanitiseToolResult(result.data)
    return {
      content: wrapExternal(`tool:${tool.name}`, JSON.stringify(safe, null, 2), 12_000),
      isError: false,
      citations: result.citations ?? [],
    }
  } catch (error) {
    console.error(`tool ${call.name} failed`, error)
    await record('error', error instanceof Error ? error.message : 'unknown')
    return {
      content: 'That tool failed. Say so plainly rather than guessing the answer.',
      isError: true,
      citations: [],
    }
  }
}

/**
 * Creates — or reuses — the approval for an exact (user, tool, arguments) triple.
 *
 * Reuse matters: a model that proposes the same thing twice should not mint two
 * grants, and the partial unique index in the schema makes that a conflict
 * rather than a race.
 */
async function raiseApproval(input: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>
  toolName: string
  args: unknown
  preview:
    | {
        summary: string
        targetIntegration: string | null
        fields: { label: string; value: string }[]
        details: unknown
      }
    | undefined
  organizationId: string
  userId: string
  threadId: string
}) {
  if (!input.preview) return null

  const argumentsHash = await fingerprint(input.toolName, input.args)
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString()

  const { data, error } = await input.supabase
    .from('action_approvals')
    .insert({
      organization_id: input.organizationId,
      thread_id: input.threadId,
      requested_for: input.userId,
      tool_name: input.toolName,
      arguments: input.args as Record<string, unknown>,
      arguments_hash: argumentsHash,
      summary: input.preview.summary,
      target_integration: input.preview.targetIntegration,
      preview: { fields: input.preview.fields },
      expires_at: expiresAt,
    })
    .select('id, summary, target_integration, expires_at')
    .single()

  if (!error && data) {
    return {
      id: data.id,
      toolName: input.toolName,
      summary: data.summary,
      targetIntegration: data.target_integration,
      expiresAt: data.expires_at,
      fields: input.preview.fields,
    }
  }

  // Unique violation: an identical live request already exists. Surface that
  // one rather than failing — the operator is being asked the same question.
  const { data: existing } = await input.supabase
    .from('action_approvals')
    .select('id, summary, target_integration, expires_at, preview')
    .eq('requested_for', input.userId)
    .eq('tool_name', input.toolName)
    .eq('arguments_hash', argumentsHash)
    .in('state', ['pending', 'approved'])
    .maybeSingle()

  if (!existing) return null

  return {
    id: existing.id,
    toolName: input.toolName,
    summary: existing.summary,
    targetIntegration: existing.target_integration,
    expiresAt: existing.expires_at,
    fields:
      (existing.preview as { fields?: { label: string; value: string }[] } | null)?.fields ?? [],
  }
}
