'use client'

import { track } from '@/lib/analytics'
import { categoryLabel, isLive, type Partner } from '@/lib/partners'

/**
 * A partner in the showroom.
 *
 * Two rules are enforced here rather than left to the page: a partner with no
 * approved link is never clickable, and every live CTA says plainly that it
 * leaves the site. Nothing on this card can reach the Stripe cart — these are
 * other people's checkouts, and no price, rating, or review is displayed
 * because we have no authorized feed for any of them.
 */
export function PartnerCard({ partner }: { partner: Partner }) {
  const live = isLive(partner)

  return (
    <article className="partner-card" data-live={live ? 'true' : undefined}>
      <div className="partner-head">
        <p className="partner-category">{categoryLabel(partner.category)}</p>
        <h3 className="partner-brand">{partner.brand}</h3>
      </div>

      <div className="partner-note">
        <p className="partner-note-title">Why it belongs here</p>
        <p>{partner.editorialNote}</p>
      </div>

      {live ? (
        <>
          <a
            className="partner-cta"
            href={partner.affiliateLink}
            target="_blank"
            rel="sponsored noopener noreferrer"
            onClick={() => track('amazon_outbound', { partner: partner.id })}
          >
            View at Partner ↗
          </a>
          <p className="partner-disclosure-inline">
            Affiliate link. You buy from {partner.brand}; we may earn a commission at no
            extra cost to you.
          </p>
        </>
      ) : (
        <>
          <span className="partner-cta" data-disabled="true" aria-disabled="true">
            Coming soon
          </span>
          <p className="partner-disclosure-inline">
            Our application to {partner.brand} is submitted and not yet approved, so there
            is nothing to link to yet.
          </p>
        </>
      )}
    </article>
  )
}
