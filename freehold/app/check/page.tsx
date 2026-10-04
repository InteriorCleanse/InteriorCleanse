import type { Metadata } from 'next'
import { DomainCheck } from '@/components/DomainCheck'

export const metadata: Metadata = {
  title: { absolute: 'Email security check. Freehold' },
  description: 'See in ten seconds whether someone else can send email as your domain: SPF, DMARC, DKIM, MTA-STS, TLS reporting, and certificate controls, each with its fix.',
  alternates: { canonical: '/check/' },
  openGraph: { url: '/check/' },
}

export default function CheckPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <p className="mono rv">Email security check</p>
        <h1 className="mt-5 text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[15ch] rv" data-i={1}>Can someone else send email as you?</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[48ch] rv" data-i={2}>
          Most payment fraud against family offices begins with an email that looks like it came from you. Seven public records decide whether it can. Check yours.
        </p>
      </section>
      <section className="page mt-14 sm:mt-20">
        <DomainCheck />
      </section>
      <section className="page mt-24 sm:mt-32">
        <div className="rule pt-10 grid gap-8 lg:grid-cols-12">
          <h2 className="lg:col-span-4 text-3xl sm:text-4xl">What it reads.</h2>
          <dl className="lg:col-span-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 text-stone">
            {[
              ['SPF', 'Which servers may send mail as your domain.'],
              ['DMARC', 'What receivers do with mail that fails, and whether you hear about it.'],
              ['DKIM', 'Whether your mail is signed, and how strong the key is.'],
              ['MTA-STS', 'Whether mail to you can be forced onto an unencrypted connection.'],
              ['TLS reporting', 'Whether failed encrypted delivery is reported to you.'],
              ['CAA', 'Which authorities may issue certificates for your domain.'],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="serif text-2xl text-graphite">{t}</dt>
                <dd className="mt-1">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
