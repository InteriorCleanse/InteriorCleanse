import Link from 'next/link'
import { branding, isAssistantConfigured } from '@/lib/env'
import { can } from '@/lib/authz'
import { requireSession } from '@/lib/session'
import { DemoBadge } from '@/components/ui'
import { AssistantDock } from '@/components/assistant/AssistantDock'

// These segments resolve the session from cookies on every request, so there
// is nothing meaningful to prerender — and prerendering would evaluate the
// Supabase config at build time, which must not be required to build.
export const dynamic = 'force-dynamic'

export const metadata = { robots: { index: false, follow: false } }

const NAV = [
  { href: '/app/command-center', label: 'Command center' },
  { href: '/app/revenue', label: 'Revenue' },
  { href: '/app/products', label: 'Products' },
  { href: '/app/briefings', label: 'Briefings' },
  { href: '/app/import', label: 'Import' },
  { href: '/app/onboarding', label: 'Onboarding' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware already bounced unauthenticated requests; this is the
  // authoritative check, since middleware only authenticates and a layout is
  // the last shared point before tenant data is rendered.
  const session = await requireSession()
  const active = session.memberships[0]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hairline bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link href="/app/command-center" className="text-sm font-semibold tracking-[0.18em]">
            {branding.appName().toUpperCase()}
          </Link>

          {active ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              <span aria-hidden="true">/</span>
              {active.name}
              {active.isDemo ? <DemoBadge /> : null}
            </span>
          ) : null}

          <nav className="ml-auto flex items-center gap-5 text-sm text-muted">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
            {session.platformRole ? (
              <Link href="/owner-admin" className="text-amber hover:underline">
                Owner console
              </Link>
            ) : null}
            <form action="/auth/signout" method="post">
              <button type="submit" className="hover:text-ink">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

      {/* The dock rides every app screen: the questions it answers are asked
          while looking at a number, not on a separate page. */}
      {active ? (
        <AssistantDock
          workspaceName={active.name}
          isDemo={active.isDemo}
          assistantName={branding.assistantName()}
          configured={isAssistantConfigured()}
          canApproveActions={can(
            {
              userId: session.userId,
              tenantRole: active.role,
              platformRole: session.platformRole,
            },
            'assistant:approve_action',
          )}
        />
      ) : null}
    </div>
  )
}
