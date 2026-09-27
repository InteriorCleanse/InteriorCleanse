import Link from 'next/link'
import { ButtonLink, Eyebrow, Panel } from '@/components/ui'
import { ArchDepth } from '@/components/motion/ArchDepth'
import { ParallaxField, type ParallaxLayer } from '@/components/motion/ParallaxField'
import { TiltCard } from '@/components/motion/TiltCard'
import { branding } from '@/lib/env'

/**
 * The front door.
 *
 * Everything on this page is true of the product behind it, or it is not on
 * this page. The parallax and the tilting preview are atmosphere; the claims
 * are the ones the tests hold: every figure shows its work, an action needs a
 * person's approval, a workspace cannot see another's rows.
 */

const HERO_LAYERS: ParallaxLayer[] = [
  { shape: 'orb', at: { top: '-6%', left: '62%' }, size: 420, depth: 0.12, lean: 18, tone: 'signal' },
  { shape: 'ring', at: { top: '18%', left: '74%' }, size: 260, depth: 0.28, lean: 34, tone: 'cobalt' },
  { shape: 'grid', at: { top: '4%', left: '-8%' }, size: 520, depth: 0.06, lean: 10, tone: 'signal' },
  { shape: 'orb', at: { top: '58%', left: '-10%' }, size: 320, depth: 0.2, lean: 24, tone: 'positive' },
  { shape: 'shard', at: { top: '40%', left: '30%' }, size: 380, depth: 0.4, lean: 40, tone: 'signal' },
  { shape: 'ring', at: { top: '70%', left: '48%' }, size: 140, depth: 0.5, lean: 48, tone: 'negative' },
]

export default function LandingPage() {
  const app = branding.appName()
  const assistant = branding.assistantName()

  return (
    <main className="field-bg relative min-h-screen overflow-x-hidden">
      <ArchDepth />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-[0.18em]">{app.toUpperCase()}</span>
        <nav className="flex items-center gap-6 text-sm text-muted">
          <Link className="hover:text-ink" href="/pricing">
            Pricing
          </Link>
          <Link className="hover:text-ink" href="/legal/privacy">
            Privacy
          </Link>
          <Link className="hover:text-ink" href="/login">
            Sign in
          </Link>
          <ButtonLink href="/signup">Start free</ButtonLink>
        </nav>
      </header>

      <section className="relative">
        <ParallaxField layers={HERO_LAYERS} />
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Eyebrow>An operator’s assistant, by voice</Eyebrow>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              <span className="text-glow">Say “Hey {assistant}” and run your business.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              {app} connects your real data — payments, orders, ad spend, your calendar, your inbox —
              and gives you an analyst you can talk to. It tells you what is making money, what is
              wasting it, and what needs a decision this morning. Every number shows its formula, its
              source and how fresh it is, and nothing changes without your approval.
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
          </div>

          <TiltCard className="rounded-panel">
            <ProductPreview assistant={assistant} />
          </TiltCard>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl space-y-4 px-6 pb-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          What it does
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Panel>
            <Eyebrow>It talks</Eyebrow>
            <h3 className="text-lg font-semibold">Ask out loud. Hear the answer.</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Hold to speak, or say the wake word. Replies are read in an expressive voice that
              performs a mood rather than reading the word for it — or in your browser’s own voice
              with no key at all. Hands-free mode listens for the next question when the answer ends.
            </p>
          </Panel>
          <Panel>
            <Eyebrow>It runs your day</Eyebrow>
            <h3 className="text-lg font-semibold">Calendar and inbox, summarised.</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              “What’s on tomorrow, and what’s new in my inbox?” Read-only connections to your own
              Google Calendar and Gmail. Mail is read live and never stored; nothing here can send,
              reply or delete.
            </p>
          </Panel>
          <Panel>
            <Eyebrow>It builds real projects</Eyebrow>
            <h3 className="text-lg font-semibold">“Build me a site for the bakery.”</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A one-page website from a plain-language brief, saved as a private preview you can
              download. Publishing it to the web through your own Vercel account is a second,
              separate approval.
            </p>
          </Panel>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-4 px-6 pb-24 pt-8 sm:grid-cols-3">
        <Panel>
          <Eyebrow>Traceable</Eyebrow>
          <h2 className="text-lg font-semibold">Every metric shows its work</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Formula, source, time range, currency, and freshness on every figure — and every spoken
            answer cites the records it came from.
          </p>
        </Panel>
        <Panel>
          <Eyebrow>Honest</Eyebrow>
          <h2 className="text-lg font-semibold">Never invented data</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            An unconnected source says so. Demo workspaces are labelled. An assistant that cannot
            answer from the data says that, then says what would.
          </p>
        </Panel>
        <Panel>
          <Eyebrow>Under your hand</Eyebrow>
          <h2 className="text-lg font-semibold">Nothing acts without approval</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Every action — a goal, an alert, a page, a publish — is a card with the exact values
            and a second, explicit yes. Tenant separation is enforced by database policy, not by
            hoping every query remembered to filter.
          </p>
        </Panel>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 pb-10 text-xs text-muted">
        <span>{app}</span>
        <Link className="hover:text-ink" href="/pricing">
          Pricing
        </Link>
        <Link className="hover:text-ink" href="/legal/privacy">
          Privacy
        </Link>
        <Link className="hover:text-ink" href="/legal/terms">
          Terms
        </Link>
      </footer>
    </main>
  )
}

/**
 * A still of the product, drawn rather than screenshotted so it reads in
 * every theme and never shows a number that pretends to be someone's.
 * Labelled as an illustration for exactly that reason.
 */
function ProductPreview({ assistant }: { assistant: string }) {
  return (
    <div
      className="rounded-panel border border-hairline bg-panel p-5 shadow-panel"
      role="img"
      aria-label={`An illustration of the ${assistant} command center with a spoken question and its cited answer`}
    >
      <div className="flex items-center gap-3 border-b border-hairline pb-3">
        <span aria-hidden="true" className="assistant-reactor">
          <span className="assistant-reactor-ring" />
          <span className="assistant-reactor-core" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{assistant}</p>
          <p className="text-xs text-muted">Northwind Supply · illustration</p>
        </div>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          <span className="voice-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          Listening
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Net revenue', '↑ 11.2%'],
          ['Contribution', '↓ 3.1%'],
          ['Ad spend', '↑ 24.8%'],
        ].map(([label, delta]) => (
          <div key={label} className="rounded-lg border border-hairline bg-panelRaised p-3">
            <p className="text-[11px] text-muted">{label}</p>
            <p className="mt-1 text-sm font-semibold text-ink">{delta}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-negative/50 bg-panelRaised p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-negative">Critical</p>
        <p className="mt-1 text-xs text-ink">Revenue is up while contribution profit is down.</p>
      </div>

      <div className="mt-4 space-y-2">
        <p className="ml-8 rounded-lg bg-panelRaised px-3 py-2 text-xs text-ink">
          Hey {assistant}, why is profit down when revenue is up?
        </p>
        <p className="text-xs leading-relaxed text-ink">
          Ad spend grew faster than revenue over the last thirty days, and refunds on the candle range
          doubled. Contribution margin fell from 38% to 31%.
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-hidden="true">
          {['Net revenue', 'Ad spend', 'Refund rate', 'Product mix'].map((chip) => (
            <li key={chip} className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-muted">
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
