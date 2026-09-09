import { branding } from '@/lib/env'
import {
  DATA_CATEGORIES,
  DELETION_GRACE_DAYS,
  LEGAL_STATUS,
  RETENTION_SUMMARY,
  SUB_PROCESSORS,
} from '@/lib/legal'

export const metadata = { title: 'Privacy', robots: { index: false, follow: false } }

/**
 * The privacy notice, as far as a codebase can write one.
 *
 * Everything factual on this page is rendered from `lib/legal.ts`, which
 * imports the retention windows from the purge job itself. The prose framing
 * is minimal on purpose: a page that *sounds* like a reviewed notice while
 * being generated text would be believed, and that is worse than a placeholder.
 * The banner is the first thing on the page and stays until a reviewer sets
 * `LEGAL_STATUS.reviewedAt`.
 */
export default function PrivacyPage() {
  const name = branding.appName()

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      {LEGAL_STATUS.reviewedAt === null ? (
        <p
          role="status"
          className="rounded-panel border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-ink"
        >
          {LEGAL_STATUS.banner}
        </p>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-ink">Privacy</h1>
        <p className="text-sm text-muted">
          What {name} stores about you and your business, who else can see any of it, how long it
          is kept, and how to take it with you or have it removed.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">What is stored</h2>
        <dl className="space-y-3">
          {DATA_CATEGORIES.map((category) => (
            <div key={category.label}>
              <dt className="text-sm font-medium text-ink">{category.label}</dt>
              <dd className="text-sm leading-relaxed text-muted">{category.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Who else receives it</h2>
        <p className="text-sm text-muted">
          Each of these is a service the software runs on or can be connected to. Those marked
          optional receive nothing unless the deployment has been configured to use them.
        </p>
        <ul className="space-y-3">
          {SUB_PROCESSORS.map((processor) => (
            <li key={processor.name} className="border-t border-hairline pt-3">
              <p className="text-sm font-medium text-ink">
                {processor.name}
                {processor.optional ? (
                  <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-muted">
                    optional
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">{processor.purpose}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{processor.receives}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">How long it is kept</h2>
        <p className="text-sm text-muted">
          Your business records and the audit log are never removed on a timer; they leave when you
          export and delete them. The following are expired automatically, and each figure below is
          read from the job that does it, so this page cannot drift from what actually happens.
        </p>
        <ul className="space-y-2">
          {RETENTION_SUMMARY.map((entry) => (
            <li key={entry.what} className="text-sm">
              <span className="font-medium text-ink">{entry.what}</span>
              <span className="text-muted"> — {entry.days} days. {entry.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Taking it with you, or having it removed</h2>
        <p className="text-sm leading-relaxed text-muted">
          Any member with the Analyst role or above can download everything in the workspace as one
          file, from every table, as it is stored. This works even when a subscription has lapsed
          and the workspace is read-only.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          The workspace owner can delete the workspace by typing its name. Stored third-party
          credentials and calendar feeds are destroyed at that moment and cannot be recovered.
          Business records are kept for {DELETION_GRACE_DAYS} days in case the deletion was a
          mistake, and are then removed. The audit entry recording the deletion is kept.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">What is never done</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
          <li>A stored API key or token is never displayed, exported, logged, or sent to the assistant.</li>
          <li>One workspace’s data is never visible to another. This is enforced by the database, not by application code, and is tested against a live database on every change.</li>
          <li>Business records are never sold, shared for advertising, or used to train a model.</li>
          <li>Demonstration data is labelled as such on every screen, in every briefing, and in every notification that carries it.</li>
        </ul>
      </section>
    </main>
  )
}
