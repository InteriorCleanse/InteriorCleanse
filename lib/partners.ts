import partners from '@/content/partners.json'

/** The sentinel an entry carries until a real affiliate link is approved. */
export const PENDING = 'PENDING_APPROVAL'

export type Partner = {
  id: string
  brand: string
  category: string
  commissionType: 'flat' | 'percentage' | 'unknown'
  /** Null where the programme does not publish a rate. Never guessed. */
  commissionAmount: number | null
  commissionNote: string
  programUrl: string
  affiliateLink: string
  applicationStatus: string
  lastVerified: string
  editorialNote: string
}

export const allPartners = partners as Partner[]

/**
 * A partner is live only once a real affiliate link has replaced the sentinel.
 *
 * Checked here rather than at each call site so a card, a CTA, and the
 * analytics event can never disagree about whether a link is clickable.
 */
export const isLive = (p: Partner) =>
  Boolean(p.affiliateLink) && p.affiliateLink !== PENDING

export const partnersByCategory = (): [string, Partner[]][] => {
  const groups = new Map<string, Partner[]>()
  for (const p of allPartners) {
    const list = groups.get(p.category) ?? []
    list.push(p)
    groups.set(p.category, list)
  }
  return Array.from(groups.entries())
}

const CATEGORY_LABEL: Record<string, string> = {
  sauna: 'Sauna',
  'cold-plunge': 'Cold plunge',
  furniture: 'Furniture',
}

export const categoryLabel = (slug: string) =>
  CATEGORY_LABEL[slug] ?? slug.replace(/-/g, ' ')
