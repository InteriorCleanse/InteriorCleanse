import type { SupabaseClient } from '@supabase/supabase-js'
import { isVaultConfigured, openSecret, vaultProvider, type SealedSecret } from '@/lib/vault'
import { DeployError, deployToVercel } from './vercel'

/**
 * A publisher for one workspace, or nothing.
 *
 * The connection is looked up through the person's own client, so RLS
 * confirms the workspace; only then does the service role open the sealed
 * token, and only at the moment of publishing. Absent means "Vercel is not
 * connected" and the executor says so — a missing publisher is a plain
 * answer, not an exception.
 */
export async function vercelPublisher(input: {
  supabase: SupabaseClient
  admin: () => SupabaseClient
  organizationId: string
}): Promise<((site: { name: string; html: string }) => Promise<{ url: string; deploymentId: string }>) | undefined> {
  if (!isVaultConfigured()) return undefined

  const { data: connection } = await input.supabase
    .from('integration_connections')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('provider', 'vercel')
    .eq('status', 'connected')
    .maybeSingle()
  if (!connection) return undefined

  return async (site) => {
    const { data } = await input
      .admin()
      .from('integration_credentials')
      .select('id, sealed')
      .eq('connection_id', connection.id)
      .eq('field', 'token')
      .is('revoked_at', null)
      .maybeSingle()
    if (!data) throw new DeployError('Vercel’s token is missing. Reconnect Vercel.', false)

    let token: string
    try {
      token = await openSecret(
        data.sealed as SealedSecret,
        { organizationId: input.organizationId, credentialId: data.id, field: 'token' },
        vaultProvider(),
      )
    } catch {
      throw new DeployError('Vercel’s token could not be opened. Reconnect Vercel.', false)
    }

    return deployToVercel({ token, name: site.name, html: site.html })
  }
}
