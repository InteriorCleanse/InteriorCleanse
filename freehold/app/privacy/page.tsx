import type { Metadata } from 'next'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What this site collects, where it goes, and how to have it removed.',
  alternates: { canonical: '/privacy/' },
  openGraph: { url: '/privacy/' },
}

export default function PrivacyPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <p className="mono">Privacy</p>
        <h1 className="mt-4 text-5xl sm:text-6xl max-w-4xl">What we collect, and why.</h1>
        <p className="measure mt-6 text-sm text-stone">
          Draft for review by a qualified professional before the domain goes live. Last updated 27 September 2026.
        </p>
      </section>
      <section className="page mt-16 sm:mt-24 rv"><h2 className="text-3xl sm:text-4xl mb-6">The short version</h2>
        <div className="measure space-y-4 text-stone">
          <p>This site collects what you type into a form and nothing else about you by default.</p>
          <p>
            Form submissions (name, email, and any message) are stored in our mailing tool, Brevo, and
            used only to reply to you or, if you joined the waitlist, to send the one or two emails the
            form describes. They are never sold or shared.
          </p>
          <p>
            If analytics are enabled, we use Plausible, which sets no cookies and collects no personal
            data. There is no advertising tracking on this site.
          </p>
          <p>
            To see, correct, or delete what we hold, email{' '}
            <a className="link" href={`mailto:${SITE.email}`}>{SITE.email}</a>. We act within a week.
          </p>
        </div>
      </section>
      <section className="page mt-16 sm:mt-24 rv"><h2 className="text-3xl sm:text-4xl mb-6">Client work</h2>
        <div className="measure space-y-4 text-stone">
          <p>
            Work for clients happens inside accounts the client owns. Client information is covered by
            the engagement agreement and a mutual NDA, not by this page.
          </p>
        </div>
      </section>
    </>
  )
}
