import { branding } from '@/lib/env'
import { getSessionContext } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Who is signed in and which workspaces they may act on.
 *
 * Exists for the product's own clients — the browser extension and the
 * desktop app — which cannot read a Server Component. It returns only what a
 * workspace switcher needs. No tokens, no keys, no subscription internals:
 * a client that wants more opens the app.
 *
 * The organization ids here are the same ids the assistant route validates a
 * request against; a client that sends one it was not given here gets "no
 * workspace available", not a different tenant.
 */
export async function GET() {
  const session = await getSessionContext()
  if (!session) {
    return Response.json({ error: 'Sign in to continue.' }, { status: 401 })
  }

  return Response.json(
    {
      user: { name: session.fullName, email: session.email },
      appName: branding.appName(),
      assistantName: branding.assistantName(),
      memberships: session.memberships.map((m) => ({
        organizationId: m.organizationId,
        name: m.name,
        role: m.role,
        isDemo: m.isDemo,
        currency: m.baseCurrency,
      })),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}
