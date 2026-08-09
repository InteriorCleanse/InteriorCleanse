import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'
import { SITE } from '@/lib/site-config'

export const metadata: Metadata = {
  title: 'Digital License',
  description:
    'What you may and may not do with digital files purchased or downloaded from InteriorCleanse.',
  alternates: { canonical: '/legal/digital-license/' },
}

export default function DigitalLicense() {
  return (
    <>
      <PageHero eyebrow="Legal" title={<em>Digital licence.</em>} />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="prose">
          <p className="lead">
            Buying a digital file gives you a licence to use it. It does not transfer
            ownership of the artwork or the copyright.
          </p>

          <h2>What you may do</h2>
          <ul>
            <li>Use the file for your own personal, non-commercial purposes.</li>
            <li>
              Print it as many times as you like for your own home, or for a gift you are
              not selling.
            </li>
            <li>Store copies on your own devices and back them up.</li>
          </ul>

          <h2>What you may not do</h2>
          <ul>
            <li>Resell, sublicense, share, or redistribute the file, altered or not.</li>
            <li>
              Use it commercially — including printing it onto goods for sale, or using it
              in client work, advertising, or a product of your own.
            </li>
            <li>Upload it to a file-sharing site, template marketplace, or public archive.</li>
            <li>Claim authorship of it, or register it as your own work.</li>
          </ul>

          <h2>Downloads</h2>
          <p>
            Download links are issued to the purchaser and are time-limited. If a link
            expires before you have retrieved your file, contact us and we will reissue it.
            Links are personal to you and should not be forwarded.
          </p>

          <h2>Refunds</h2>
          <p>
            Digital files cannot be returned once downloaded. A file that is corrupt, will
            not open, or does not match its listing will be replaced or refunded.
          </p>

          <h2>Commercial use</h2>
          <p>
            If you want to use a file commercially, ask. Extended licences are handled case
            by case — email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
          </p>
        </div>
      </section>
    </>
  )
}
