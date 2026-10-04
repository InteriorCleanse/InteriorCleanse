import { Eyebrow, Panel } from '@/components/ui'
import { requireSession } from '@/lib/session'
import { MfaPanel } from './mfa-panel'

export const metadata = { title: 'Security' }

/**
 * Your account's own security.
 *
 * The second factor lives here. Enrolling one changes what "signed in" means
 * for this person everywhere in the product: a password alone stops being
 * enough, on the web, in the extension and in the desktop app, because the
 * server stops treating a password-only session as a session. The owner
 * console will not open without one.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const [session, params] = await Promise.all([requireSession(), searchParams])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Security</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account</h1>
        <p className="text-sm text-muted">
          Signed in as {session.email}
          {session.platformRole ? ` · platform ${session.platformRole.replace('platform_', '')}` : ''}.
        </p>
      </header>

      {params.notice ? (
        <Panel className="border-amber/40">
          <p className="text-sm text-ink" role="status">
            {params.notice}
          </p>
        </Panel>
      ) : null}

      <MfaPanel isPlatformStaff={Boolean(session.platformRole)} />

      <Panel>
        <Eyebrow>What is already true</Eyebrow>
        <ul className="space-y-2 text-sm text-muted">
          <li>Every workspace’s rows are separated by database policy, proved against a live Postgres on every change.</li>
          <li>Every connected key is sealed with its own data key before it reaches the database; nothing reads one back.</li>
          <li>Nothing the assistant proposes happens until you approve the exact values on a card.</li>
          <li>Every page is served with a content-security policy that lets scripts come from this origin only and lets nobody frame the app.</li>
          <li>Your mailbox, when connected, is read live and never stored; a colleague cannot see it.</li>
        </ul>
        <p className="mt-3 text-xs text-muted">
          What is not yet true — a hardware-backed key store behind the vault, an outside review —
          is listed plainly in the deployment’s launch checklist, not hidden.
        </p>
      </Panel>
    </div>
  )
}
