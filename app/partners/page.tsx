import type { Metadata } from 'next'
import { PartnerCard } from '@/components/PartnerCard'
import { EnvironmentHero } from '@/components/hero/EnvironmentHero'
import { allPartners, categoryLabel, isLive, partnersByCategory } from '@/lib/partners'
import { getScene } from '@/lib/scenes'

export const metadata: Metadata = {
  title: 'Partners',
  description:
    'A curated showroom of sauna, cold plunge, and furniture makers we would put in our own house. Some links are affiliate links.',
  alternates: { canonical: '/partners/' },
}

export default function Partners() {
  const pavilion = getScene('pavilion')
  const groups = partnersByCategory()
  const liveCount = allPartners.filter(isLive).length

  return (
    <>
      {pavilion ? <EnvironmentHero scene={pavilion} height="band" /> : null}

      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="section-inner">
          {/* The disclosure sits above the cards as well as beside every CTA —
              a reader should meet it before the first link, not after. */}
          <div className="partner-disclosure">
            <p>
              <strong>Affiliate disclosure.</strong> Some links on this page are affiliate
              links. If you buy through one, we may earn a commission at no extra cost to
              you. It never changes what we recommend, and nothing here is bought through
              our checkout — every purchase happens on the partner&rsquo;s own site.
            </p>
            {liveCount === 0 ? (
              <p className="partner-disclosure-note">
                No partner links are live yet. Applications are submitted and these entries
                will become clickable once approved.
              </p>
            ) : null}
          </div>

          {groups.map(([category, partners]) => (
            <div className="partner-group" key={category}>
              <h2 className="partner-group-title">{categoryLabel(category)}</h2>
              <div className="partner-grid">
                {partners.map((p) => (
                  <PartnerCard partner={p} key={p.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
