import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eyebrow, Panel } from '@/components/ui'
import { can } from '@/lib/authz'
import { readiness, type ReadinessLevel } from '@/lib/readiness'
import { requireSession } from '@/lib/session'
// Imported for its side effect as well as its type: this is what registers the
// distributed rate-limit store, and without it the page would report the
// in-memory fallback on a deployment that actually has Redis.
import '@/lib/ratelimit-configured'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Owner console', robots: { index: false, follow: false } }

const TONE: Record<ReadinessLevel, { className: string; label: string }> = {
  ok: { className: 'text-positive', label: 'Ready' },
  note: { className: 'text-muted', label: 'Not configured' },
  warning: { className: 'text-amber', label: 'Degraded' },
  blocker: { className: 'text-negative', label: 'Blocker' },
}

/**
 * Platform owner console. There is no public registration for this surface and
 * no link to it from any customer screen. Reaching it requires a row in
 * platform_staff, which only the bootstrap function or the service role can
 * write.
 *
 * What it shows is deployment readiness, read from the environment on every
 * request. A checklist that records what somebody once ticked describes a past
 * deployment; this describes the one that is running.
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

  const report = readiness()

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Eyebrow>Platform</Eyebrow>
      <h1 className="text-3xl font-semibold">Owner console</h1>
      <p className="mt-2 text-sm text-muted">
        Signed in as {session.email} · {session.platformRole}
      </p>

      <Panel className="mt-8">
        <h2 className="text-lg font-semibold">Deployment readiness</h2>
        <p
          className={`mt-2 text-sm ${report.safeForCustomerData ? 'text-positive' : 'text-negative'}`}
        >
          {report.safeForCustomerData
            ? report.warnings > 0
              ? `Nothing blocking, ${report.warnings} degraded. Read those before inviting anyone.`
              : 'Nothing blocking and nothing degraded.'
            : `${report.blockers} blocking ${report.blockers === 1 ? 'issue' : 'issues'}. Do not take real customer data until ${report.blockers === 1 ? 'it is' : 'they are'} resolved.`}
        </p>

        <ul className="mt-5 space-y-4">
          {report.checks.map((check) => (
            <li key={check.id} className="border-t border-hairline pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">{check.label}</h3>
                <span className={`text-[11px] uppercase tracking-[0.14em] ${TONE[check.level].className}`}>
                  {TONE[check.level].label}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{check.detail}</p>
              {check.remedy ? (
                <p className="mt-1 text-xs text-ink">{check.remedy}</p>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-muted">
          Read from the environment on every request, so this is the running deployment rather than
          a record of one. The full gate list, including the parts no code can check — a restore
          rehearsal, a security review, real terms — is in <code>docs/LAUNCH_CHECKLIST.md</code>.
        </p>

        <Link
          href="/app/command-center"
          className="mt-6 inline-block text-sm text-signal hover:underline"
        >
          Back to command center
        </Link>
      </Panel>
    </main>
  )
}
