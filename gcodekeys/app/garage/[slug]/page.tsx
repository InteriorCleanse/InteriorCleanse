import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GUIDES, getGuide } from '@/lib/guides'
import { EmailCapture } from '@/components/EmailCapture'

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const g = getGuide(params.slug)
  if (!g) return { title: 'Guide not found' }
  return { title: g.title, description: g.dek }
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const g = getGuide(params.slug)
  if (!g) notFound()

  const more = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 2)

  return (
    <main className="wrap" style={{ paddingBlock: '40px 64px', maxWidth: 760 }}>
      <Link href="/garage/" className="ex" style={{ color: 'var(--muted)', letterSpacing: '.18em' }}>← THE GARAGE</Link>
      <div className="kicker" style={{ color: 'var(--gold)', marginTop: 18 }}>{g.tag} · {g.readMins} min read</div>
      <h1 style={{ fontSize: 'clamp(2rem,5vw,3rem)', margin: '.4rem 0 0', letterSpacing: '-.02em' }}>{g.title}</h1>
      <p className="sub" style={{ fontSize: '1.12rem', maxWidth: '62ch' }}>{g.dek}</p>

      <article className="guidebody">
        {g.sections.map((s, i) => (
          <section key={i}>
            <h2>{s.h}</h2>
            {s.body?.map((p, j) => <p key={j}>{p}</p>)}
            {s.list ? (
              <ul>{s.list.map((li, j) => <li key={j}>{li}</li>)}</ul>
            ) : null}
          </section>
        ))}
      </article>

      <div style={{ marginTop: 38 }}>
        <EmailCapture source={`guide:${g.slug}`} heading="Keep guides like this coming" sub="One useful note at a time on keys and ownership — plus the free Car-Key Survival Guide to start." />
      </div>

      {more.length ? (
        <div style={{ marginTop: 40 }}>
          <div className="kicker" style={{ color: 'var(--gold)' }}>Keep reading</div>
          <div className="guidegrid" style={{ marginTop: 14 }}>
            {more.map((m) => (
              <Link key={m.slug} href={`/garage/${m.slug}/`} className="guidecard">
                <div className="guidecard-tag">{m.tag}</div>
                <h2>{m.title}</h2>
                <p>{m.dek}</p>
                <div className="guidecard-foot"><span>{m.readMins} min read</span><span className="arrow" aria-hidden="true">→</span></div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  )
}
