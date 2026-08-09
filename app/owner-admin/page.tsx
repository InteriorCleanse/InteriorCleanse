import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eyebrow, Panel } from '@/components/ui'
import { can } from '@/lib/authz'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Owner console', robots: { index: false, follow: false } }

/**
 * Platform owner console. There is no public registration for this surface and
 * no link to it from any customer screen. Reaching it requires a row in
 * platform_staff, which only the bootstrap function or the service role can write.
 */
export default async function OwnerAdminPage() {
  const session = await requireSession()

  const actor = {
    userId: session.userId,
    tenantRole: null,
    platformRole: session.platformRole,
  }

  // Not 403 — a non-staff user should not learn that this route exists.
  if (!can(actor, 'platform:view_console')) redirect('/app/command-center')

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Eyebrow>Platform</Eyebrow>
      <h1 className="text-3xl font-semibold">Owner console</h1>
      <p className="mt-2 text-sm text-muted">
        Signed in as {session.email} · {session.platformRole}
      </p>

      <Panel className="mt-8">
        <h2 className="text-lg font-semibold">Checkpoint 6</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Platform analytics — MRR, ARR, churn, activation, connector health, AI cost per tenant,
          feature flags, audit log, and support impersonation — arrive with Checkpoint 6. The
          access boundary is live now: this route is unreachable without a{' '}
          <code>platform_staff</code> row, and impersonation is already forbidden from performing
          any consequential action (see <code>tests/authz.test.ts</code>).
        </p>
        <Link href="/app/command-center" className="mt-4 inline-block text-sm text-signal hover:underline">
          Back to command center
        </Link>
      </Panel>
    </main>
  )
}
