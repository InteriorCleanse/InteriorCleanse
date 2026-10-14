'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { can } from '@/lib/authz'
import { requireMembership } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { STAGES, STATUSES, seedRows } from '@/lib/workflow/template'

/**
 * Working the playbook.
 *
 * Every action acts on the business the person is in — their active
 * membership — and never on an organization named in the form. Ids that do
 * arrive from the form (a step's id, an assignee) are filters on top of
 * that: a step in another workspace matches nothing, and RLS refuses the
 * write if anything slipped past. The role checks here are the same rules
 * the database enforces, stated early so the answer is a sentence.
 */

const PATH = '/app/workflow'

function back(notice: string): never {
  redirect(`${PATH}?notice=${encodeURIComponent(notice)}`)
}

const StartSchema = z.object({ kind: z.enum(['physical', 'digital']) })

export async function startPlaybook(formData: FormData): Promise<void> {
  const { membership, actor, session } = await requireMembership()
  if (!can(actor, 'workflow:edit')) back('Starting the playbook needs the Member role or above.')

  const parsed = StartSchema.safeParse({ kind: formData.get('kind') })
  if (!parsed.success) back('Choose what kind of products this business sells.')

  const supabase = await supabaseServer()
  // ON CONFLICT on (organization_id, template_key): starting twice adds
  // nothing, and a step someone already moved keeps its status.
  const { error } = await supabase
    .from('workflow_items')
    .upsert(
      seedRows({ organizationId: membership.organizationId, userId: session.userId, kind: parsed.data.kind }),
      { onConflict: 'organization_id,template_key', ignoreDuplicates: true },
    )
  if (error) back('The playbook could not be started. Try again in a moment.')

  revalidatePath(PATH)
  revalidatePath('/app/businesses')
  back('Playbook started. Work down from the top; the agent can see it too.')
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  blockedReason: z.string().trim().max(500),
  notes: z.string().max(4000),
  assigneeId: z.string().uuid().nullable(),
})

export async function updateStep(formData: FormData): Promise<void> {
  const { membership, actor } = await requireMembership()
  if (!can(actor, 'workflow:edit')) back('Moving steps needs the Member role or above.')

  const dueRaw = String(formData.get('dueOn') ?? '').trim()
  const assigneeRaw = String(formData.get('assigneeId') ?? '').trim()
  const parsed = UpdateSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
    dueOn: dueRaw === '' ? null : dueRaw,
    blockedReason: String(formData.get('blockedReason') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    assigneeId: assigneeRaw === '' ? null : assigneeRaw,
  })
  if (!parsed.success) back('That step could not be saved: check the date and fields.')

  const supabase = await supabaseServer()

  // An assignee must be a member of this business. Checked through the
  // person's client, so a colleague's id from elsewhere simply is not found.
  if (parsed.data.assigneeId) {
    const { data: member } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', membership.organizationId)
      .eq('user_id', parsed.data.assigneeId)
      .eq('status', 'active')
      .maybeSingle()
    if (!member) back('That person is not a member of this business.')
  }

  const { data, error } = await supabase
    .from('workflow_items')
    .update({
      status: parsed.data.status,
      due_on: parsed.data.dueOn,
      // The database clears this unless the step is blocked.
      blocked_reason: parsed.data.status === 'blocked' ? parsed.data.blockedReason || null : null,
      notes: parsed.data.notes,
      assignee_id: parsed.data.assigneeId,
    })
    .eq('id', parsed.data.id)
    .eq('organization_id', membership.organizationId)
    .select('id')
  if (error || !data || data.length === 0) back('That step could not be saved.')

  revalidatePath(PATH)
  revalidatePath('/app/businesses')
}

const AddSchema = z.object({
  stage: z.enum(STAGES),
  title: z.string().trim().min(1, 'Give the step a title.').max(160),
  detail: z.string().trim().max(2000),
})

export async function addStep(formData: FormData): Promise<void> {
  const { membership, actor, session } = await requireMembership()
  if (!can(actor, 'workflow:edit')) back('Adding steps needs the Member role or above.')

  const parsed = AddSchema.safeParse({
    stage: formData.get('stage'),
    title: String(formData.get('title') ?? ''),
    detail: String(formData.get('detail') ?? ''),
  })
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? 'Check the step.')

  const supabase = await supabaseServer()
  const { data: last } = await supabase
    .from('workflow_items')
    .select('position')
    .eq('organization_id', membership.organizationId)
    .eq('stage', parsed.data.stage)
    .order('position', { ascending: false })
    .limit(1)

  const { error } = await supabase.from('workflow_items').insert({
    organization_id: membership.organizationId,
    stage: parsed.data.stage,
    template_key: null,
    title: parsed.data.title,
    detail: parsed.data.detail,
    position: Number(last?.[0]?.position ?? 0) + 10,
    created_by: session.userId,
  })
  if (error) back('The step could not be added.')

  revalidatePath(PATH)
  revalidatePath('/app/businesses')
}

export async function deleteStep(formData: FormData): Promise<void> {
  const { membership, actor } = await requireMembership()
  if (!can(actor, 'workflow:manage')) back('Only an admin can remove a step. Mark it “Not needed” instead.')

  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) back('Which step?')

  const supabase = await supabaseServer()
  const { error } = await supabase
    .from('workflow_items')
    .delete()
    .eq('id', id.data)
    .eq('organization_id', membership.organizationId)
  if (error) back('The step could not be removed.')

  revalidatePath(PATH)
  revalidatePath('/app/businesses')
}
