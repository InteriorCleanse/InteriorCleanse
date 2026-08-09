import Link from 'next/link'
import { ButtonLink, Eyebrow, Panel } from '@/components/ui'
import { branding } from '@/lib/env'

export default function LandingPage() {
  const app = branding.appName()

  return (
    <main className="field-bg min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-[0.18em]">{app.toUpperCase()}</span>
        <nav className="flex items-center gap-6 text-sm text-muted">
          <Link className="hover:text-ink" href="/legal/privacy">
            Privacy
          </Link>
          <Link className="hover:text-ink" href="/login">
            Sign in
          </Link>
          <ButtonLink href="/signup">Start free</ButtonLink>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <Eyebrow>Business intelligence, in plain language</Eyebrow>
        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          Know what is making money, what is wasting money, and what to do next.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          {app} connects your real business data, calculates profit you can actually trace, and
          gives you an analyst you can talk to. Every number shows its formula, its source, and how
          fresh it is.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Create your workspace</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
        <p className="mt-4 text-xs text-muted">
          No results are guaranteed. {app} reports on your data — it does not promise revenue.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-3">
        <Panel>
          <Eyebrow>Traceable</Eyebrow>
          <h2 className="text-lg font-semibold">Every metric shows its work</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Formula, source, time range, currency, and freshness on every figure — with a
            drill-down to the underlying records.
          </p>
        </Panel>
        <Panel>
          <Eyebrow>Honest</Eyebrow>
          <h2 className="text-lg font-semibold">Never invented data</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            An unconnected source says so. Demo workspaces are labeled. Nothing on a production
            screen is a placeholder pretending to be real.
          </p>
        </Panel>
        <Panel>
          <Eyebrow>Isolated</Eyebrow>
          <h2 className="text-lg font-semibold">Your data stays yours</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Tenant separation is enforced by database policies, not by hoping every query
            remembered to filter.
          </p>
        </Panel>
      </section>
    </main>
  )
}
