'use server'

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { isWorkspaceId, safeReturnPath } from '@/lib/workspace/active'
import { setActiveWorkspace } from '@/lib/workspace/active-cookie'

/**
 * Switching businesses.
 *
 * The id arrives from a form, so it is untrusted: it is written to the
 * cookie only if the session already belongs to that workspace. Anything
 * else changes nothing, and the response is the same either way, so the
 * switcher cannot be used to probe for workspaces.
 */
export async function switchWorkspace(formData: FormData): Promise<void> {
  const session = await requireSession()
  const requested = formData.get('organizationId')
  const back = safeReturnPath(formData.get('returnTo'))

  if (isWorkspaceId(requested) && session.memberships.some((m) => m.organizationId === requested)) {
    await setActiveWorkspace(requested)
  }
  redirect(back)
}
