import { z } from 'zod'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { checkApproval, type ActionApproval, type ApprovalState } from '@/lib/assistant/approval'
import { executeApprovedAction } from '@/lib/assistant/execute'

/**
 * Deciding an approval, and carrying it out.
 *
 * The database function `decide_action_approval` owns the decision rules (only
 * the named person, only while pending, only before expiry, always audited).
 * This handler owns what happens *after* an approval: re-verify the binding
 * against the arguments about to be used, claim the approval exactly once, then
 * execute.
 *
 * Claim-before-execute is deliberate. If execution fails after the claim, the
 * operator is asked to approve again — mildly annoying. If execution ran before
 * the claim, a double-submitted request would create the record twice. Given
 * the choice between repeating a question and repeating a side effect, repeat
 * the question.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  approvalId: z.string().uuid(),
  approve: z.boolean(),
})

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) {
    return Response.json({ error: 'Sign in first.' }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Malformed request.' }, { status: 400 })
  }

  const supabase = await supabaseServer()

  // RLS scopes this select to the caller's workspaces, so a foreign id reads
  // as "not found" without confirming it exists.
  const { data: row } = await supabase
    .from('action_approvals')
    .select(
      'id, organization_id, requested_for, tool_name, arguments, arguments_hash, summary, target_integration, state, expires_at',
    )
    .eq('id', parsed.data.approvalId)
    .maybeSingle()

  if (!row) {
    return Response.json({ error: 'This action has not been approved yet.' }, { status: 404 })
  }

  const { error: decideError } = await supabase.rpc('decide_action_approval', {
    approval: parsed.data.approvalId,
    approve: parsed.data.approve,
  })

  if (decideError) {
    return Response.json({ error: humanise(decideError.message) }, { status: 403 })
  }

  if (!parsed.data.approve) {
    return Response.json({ state: 'rejected', message: 'Declined. Nothing was changed.' })
  }

  // Re-derive the binding from the arguments we are about to use, rather than
  // trusting that the row we read a moment ago is still the row that matters.
  const approval: ActionApproval = {
    id: row.id,
    organizationId: row.organization_id,
    requestedFor: row.requested_for,
    toolName: row.tool_name,
    argumentsHash: row.arguments_hash,
    summary: row.summary,
    targetIntegration: row.target_integration,
    state: 'approved' as ApprovalState,
    expiresAt: new Date(row.expires_at),
  }

  const verified = await checkApproval({
    approval,
    toolName: row.tool_name,
    args: row.arguments,
    actorUserId: session.userId,
    organizationId: row.organization_id,
  })

  if (!verified.ok) {
    return Response.json({ error: verified.reason, code: verified.code }, { status: 409 })
  }

  const { data: claimed } = await supabase.rpc('mark_approval_executed', {
    approval: parsed.data.approvalId,
  })

  if (claimed !== true) {
    return Response.json(
      { error: 'This action has already been carried out.', code: 'already_executed' },
      { status: 409 },
    )
  }

  const result = await executeApprovedAction({
    supabase,
    toolName: row.tool_name,
    args: row.arguments,
    organizationId: row.organization_id,
    actorUserId: session.userId,
  })

  if (!result.ok) {
    return Response.json(
      {
        error: `${result.reason} The approval has been used up — ask the assistant again if you still want this.`,
      },
      { status: 500 },
    )
  }

  return Response.json({ state: 'executed', message: result.summary, recordId: result.recordId })
}

/** Postgres exception text is not user-facing copy. */
function humanise(message: string): string {
  if (/requested for someone else/i.test(message)) {
    return 'This approval was requested for a different person.'
  }
  if (/requires the Admin role/i.test(message)) {
    return 'Approving an action requires the Admin role.'
  }
  if (/already been decided/i.test(message)) return 'This approval has already been decided.'
  if (/expired/i.test(message)) return 'This approval expired. Ask again.'
  return 'This action has not been approved yet.'
}
