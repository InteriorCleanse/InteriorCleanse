import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Security and discretion',
  description: 'How Freehold handles a client’s information: access, storage, models, people, and what happens when an engagement ends.',
  alternates: { canonical: '/discretion/' },
  openGraph: { url: '/discretion/' },
}

const sections: { t: string; items: string[] }[] = [
  {
    t: 'Before anything changes hands',
    items: [
      'A mutual non-disclosure agreement is signed before any document, credential, or name is shared.',
      'Scope is agreed in writing: which systems, which people, which weeks. Nothing outside it is touched.',
      'The first call needs no information about the family at all. We ask what kind of office it is, not who.',
    ],
  },
  {
    t: 'Access',
    items: [
      'We work inside accounts you own. You grant access; you can see it; you revoke it.',
      'Access is the narrowest each system allows: read-only for the review, scoped roles for a build.',
      'We never ask for a personal password. Where a system cannot grant a scoped role, we work beside your staff instead.',
      'Every grant is listed in the engagement record and revoked on the last day, with written confirmation.',
    ],
  },
  {
    t: 'Where your information lives',
    items: [
      'In your systems. Code in your repository, data in your database, the review report in the channel you choose.',
      'Working notes are kept in one encrypted workspace per engagement and deleted when it ends, with written confirmation.',
      'Nothing about a client is kept on a phone, in a personal email account, or in a shared drive with anyone else.',
    ],
  },
  {
    t: 'AI models',
    items: [
      'Where a model is used, it is used through a commercial API whose terms exclude training on what is sent.',
      'On a build, the model runs on your own API key, so the usage record is yours, not ours.',
      'Names, account numbers, and personal details are not sent to a model when the work does not need them.',
    ],
  },
  {
    t: 'People',
    items: [
      'Freehold is one person. No subcontractor sees your information without your written consent, named in advance.',
      'We do not cite clients, publish case studies that identify a family, or mention an engagement socially.',
      'Your advisers, staff, and IT are treated as peers, and findings are written so they can act on them without us.',
    ],
  },
  {
    t: 'If something goes wrong',
    items: [
      'If we believe your information has been exposed through us, you hear within 24 hours, by phone and in writing.',
      'You get what we know, what we have done, and what we recommend, in that order, and updates until it is closed.',
    ],
  },
  {
    t: 'Services we rely on',
    items: [
      'GitHub for code, Vercel for hosting, a Postgres provider for data: on a build these are your accounts, not ours.',
      'Brevo holds the name and email of anyone who writes to us through this site, and nothing else.',
      'Anthropic provides the model, through its commercial API.',
    ],
  },
]

export default function DiscretionPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <p className="mono rv">Security and discretion</p>
        <h1 className="mt-5 text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[13ch] rv" data-i={1}>What we do with what you tell us.</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[46ch] rv" data-i={2}>
          The policy every engagement runs under. Short, specific, and written to be held to.
        </p>
        <p className="mt-4 text-sm text-stone rv" data-i={3}>
          Version 1, 28 September 2026. Draft for adoption by the owner and review by a qualified professional.
        </p>
      </section>

      <section className="page mt-20 sm:mt-28">
        <ol className="max-w-[70ch] list-none">
          {sections.map((s, i) => (
            <li key={s.t} className="rule py-10 grid gap-5 sm:grid-cols-[4rem_1fr] rv">
              <span className="mono pt-2">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="text-3xl sm:text-4xl">{s.t}</h2>
                <ul className="mt-5 space-y-3 text-stone list-none">
                  {s.items.map((it) => (
                    <li key={it} className="pl-5 relative before:content-[''] before:absolute before:left-0 before:top-[0.7em] before:w-2 before:h-px before:bg-[var(--stone)]">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <p className="rule pt-8 max-w-[62ch] text-stone rv">
          Questions about this policy, or a request for the signed version before a first call, go to{' '}
          <a className="link" href={`mailto:${SITE.email}`}>{SITE.email}</a>. The review it protects is described on{' '}
          <Link className="link" href="/private/review/">what the review examines</Link>.
        </p>
      </section>
    </>
  )
}
