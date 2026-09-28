import type { Metadata } from 'next'
import Link from 'next/link'
import { Cta } from '@/components/Cta'

export const metadata: Metadata = {
  title: 'What the review examines',
  description: 'The footprint and email security review, check by check: domains, mail, the public web, people, and the accounts that hold them together.',
  alternates: { canonical: '/private/review/' },
  openGraph: { url: '/private/review/' },
}

const areas: { t: string; why: string; checks: string[] }[] = [
  {
    t: 'Domains',
    why: 'Most impersonation begins with a domain that lapsed, a record nobody remembers, or a registrar account with one password.',
    checks: [
      'Every domain the family and office own, found from records rather than memory',
      'Registrar lock, expiry dates, and who can renew',
      'DNS records that point at services no longer in use, which others can claim',
      'DNSSEC where the registrar supports it',
      'Look-alike domains registered by someone else',
    ],
  },
  {
    t: 'Mail',
    why: 'A family office is paid by email and instructs by email. Mail authentication decides whether someone else can send as you.',
    checks: [
      'SPF: which services may send as the domain, and whether the record is within its limits',
      'DKIM: every sending service signs, with keys of adequate length',
      'DMARC: the policy in force, whether reports are collected, and what they show',
      'MTA-STS and TLS reporting, so mail to you cannot be downgraded in transit',
      'Parked domains that should refuse to send mail at all',
    ],
  },
  {
    t: 'The public web',
    why: 'Old pages, forgotten subdomains, and staff pages tell a stranger how the office works and who approves payments.',
    checks: [
      'Every subdomain and what answers on it',
      'Certificates, security headers, and software versions on each site',
      'Pages that name staff, roles, reporting lines, or suppliers',
      'Forms and documents that publish more than intended',
    ],
  },
  {
    t: 'People',
    why: 'An attacker needs a name, a role, and a plausible reason. The review measures how easily those are found.',
    checks: [
      'What a search for each named principal and senior staff member returns',
      'Listings on data-broker sites, with the removal route for each',
      'Office addresses that appear in public breach notifications, with your consent to check',
      'Photographs and metadata that reveal locations or routines',
    ],
  },
  {
    t: 'The accounts that hold it together',
    why: 'The domain, the DNS host, and the mail admin console are three keys to the whole office.',
    checks: [
      'Multi-factor authentication on the registrar, DNS host, and mail administration',
      'Who holds administrator rights, and whether they still should',
      'Recovery email addresses and phone numbers on those accounts',
    ],
  },
]

export default function ReviewPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <p className="mono rv">Freehold Private · the review</p>
        <h1 className="mt-5 text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[14ch] rv" data-i={1}>What the review examines.</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[46ch] rv" data-i={2}>
          Two weeks. Five areas. Every finding comes with the fix, in order, and who should do it.
        </p>
      </section>

      <section className="page mt-20 sm:mt-28">
        {areas.map((a, i) => (
          <article key={a.t} className="rule py-10 sm:py-14 grid gap-6 lg:grid-cols-12 rv">
            <div className="lg:col-span-5">
              <p className="mono mb-3">{String(i + 1).padStart(2, '0')}</p>
              <h2 className="text-3xl sm:text-4xl">{a.t}</h2>
              <p className="text-stone mt-4 max-w-[40ch]">{a.why}</p>
            </div>
            <ul className="lg:col-span-7 list-none divide-y divide-[var(--hairline)] border-t border-hairline lg:border-t-0">
              {a.checks.map((c) => (
                <li key={c} className="py-3 first:pt-3 lg:first:pt-0">{c}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="page mt-16 sm:mt-24 grid gap-12 lg:grid-cols-2">
        <div className="rule pt-8 rv">
          <h2 className="text-3xl sm:text-4xl">What we need from you.</h2>
          <ul className="mt-5 space-y-3 text-stone list-none">
            <li>A list of the domains you know about. We find the rest.</li>
            <li>Read-only access to the DNS host and mail administration, granted by you and revoked on the last day.</li>
            <li>The names you want included in the people check, and consent for each.</li>
            <li>Thirty minutes at the start and forty-five at the end.</li>
          </ul>
        </div>
        <div className="rule pt-8 rv" data-i={1}>
          <h2 className="text-3xl sm:text-4xl">What it is not.</h2>
          <ul className="mt-5 space-y-3 text-stone list-none">
            <li>Not a penetration test. Nothing is attacked, and nothing is tested without separate written authorisation.</li>
            <li>No access to personal email, banking, or devices.</li>
            <li>Not a substitute for your IT provider. The report is written for them to act on.</li>
          </ul>
        </div>
      </section>

      <section className="page mt-16 sm:mt-24">
        <div className="rule pt-10 flex flex-col items-start gap-6 rv">
          <p className="text-stone max-w-[56ch]">
            Every engagement runs under our written <Link className="link" href="/discretion/">security and discretion policy</Link>. The fee is fixed and quoted after a twenty-minute call.
          </p>
          <Cta href="/private/#call">Request a call</Cta>
        </div>
      </section>
    </>
  )
}
