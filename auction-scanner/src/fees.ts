/**
 * Buyer fees — what each auction house adds on top of the winning bid.
 *
 * The "hammer price" is the winning bid. Most houses then add a buyer fee
 * (also called a buyer's premium). Every schedule here is as published on the
 * house's own page when it was written, with a link to verify it. Where a
 * house uses a sliding scale (a table of fees by price band), Gavel invents
 * nothing: `buyerFee` returns $0 with a basis that starts "unknown" so the bid
 * plan can show a warning and ask for the real number.
 */

export type FeeSchedule = {
  /** Matches the `id` in src/sources/directory.ts. */
  houseId: string
  /** How the fee is worked out. 'sliding' and 'stated-per-lot' have no number here on purpose. */
  basis: 'percent' | 'none' | 'sliding' | 'stated-per-lot'
  /** Percent of the hammer price, when basis is 'percent'. 5 means 5%. */
  percent?: number
  minUsd?: number
  maxUsd?: number
  /** Plain-English note shown next to the fee. */
  note: string
  /** Where to check the current fee. */
  verifyUrl: string
}

export const FEE_SCHEDULES: FeeSchedule[] = [
  { houseId: 'ebay', basis: 'none', note: 'No buyer fee on vehicles; the seller pays the listing fee. Verify on the link.', verifyUrl: 'https://www.ebay.com/help/selling/fees-credits-invoices/motors-fees' },
  { houseId: 'carsandbids', basis: 'percent', percent: 5, minUsd: 250, maxUsd: 7500, note: '5% of the hammer price, minimum $250, maximum $7,500, as published; verify on the link.', verifyUrl: 'https://carsandbids.com/faq' },
  { houseId: 'bat', basis: 'percent', percent: 5, minUsd: 250, maxUsd: 7500, note: '5% of the hammer price, minimum $250, maximum $7,500, as published; verify on the link.', verifyUrl: 'https://bringatrailer.com/faq/' },
  { houseId: 'copart', basis: 'sliding', note: 'Sliding scale by sale price, plus a gate fee, an internet-bid fee and, if used, a broker fee. Use the fee calculator on the link and type the total in.', verifyUrl: 'https://www.copart.com/content/us/en/member-fees' },
  { houseId: 'iaa', basis: 'sliding', note: 'Sliding scale by sale price, plus an internet-bid fee and service fees. Use the fee calculator on the link and type the total in.', verifyUrl: 'https://www.iaai.com/buyerfees' },
  { houseId: 'manheim', basis: 'sliding', note: 'Buy fee on a sliding scale, set per auction location. Check the location page and type the fee in.', verifyUrl: 'https://www.manheim.com/publications/fees' },
  { houseId: 'adesa', basis: 'sliding', note: 'Sliding scale by sale price. Check the current schedule and type the fee in.', verifyUrl: 'https://www.openlane.com/us/fees' },
  { houseId: 'acv', basis: 'sliding', note: 'Flat buy fee by price band, shown in the app. Type the fee for your price band in.', verifyUrl: 'https://www.acvauctions.com/faq' },
  { houseId: 'govdeals', basis: 'stated-per-lot', note: 'Buyer premium varies by seller and is stated on each lot. Read the lot page and type it in.', verifyUrl: 'https://www.govdeals.com/en/help' },
  { houseId: 'gsa', basis: 'none', note: 'GSA Auctions charges no buyer premium: the bid is the price, plus any sales tax. Verify on the lot.', verifyUrl: 'https://www.gsaauctions.gov/' },
  { houseId: 'marketcheck', basis: 'stated-per-lot', note: 'The seller behind the listing sets the fee: a dealer documentation fee, or the auction\'s buyer fee. Read the listing and type it in.', verifyUrl: 'https://www.marketcheck.com/apis/pricing/' },
  { houseId: 'local', basis: 'stated-per-lot', note: 'Stated at the door, usually a percent of hammer with a minimum. Ask before you register and type it in.', verifyUrl: 'https://www.google.com/maps/search/public+auto+auction' },
  { houseId: 'collector', basis: 'percent', percent: 10, note: 'About 10% of hammer in person and more online, as published per event; verify before you register.', verifyUrl: 'https://www.mecum.com/faq/' },
  { houseId: 'pcarmarket', basis: 'stated-per-lot', note: 'A percent with a minimum and a cap, set in the buyer agreement. Check it and type the percent.', verifyUrl: 'https://www.pcarmarket.com/buyer-agreement/' },
  { houseId: 'collectingcars', basis: 'percent', percent: 6, minUsd: 1000, maxUsd: 10000, note: '6% of the hammer price, minimum US$1,000, maximum US$10,000, as published; verify on the link.', verifyUrl: 'https://collectingcars.com/faqs' },
  { houseId: 'hagerty', basis: 'percent', percent: 7, minUsd: 500, note: '7% of the hammer price, minimum $500, no cap found, as published; verify on the link.', verifyUrl: 'https://www.hagerty.com/marketplace/faq/bid' },
  { houseId: 'dupont', basis: 'percent', percent: 5, note: '5% of the hammer price, as published; verify on the link.', verifyUrl: 'https://live.dupontregistry.com/bidder-guidelines' },
  { houseId: 'mbmarket', basis: 'percent', percent: 4.5, minUsd: 225, maxUsd: 4500, note: '4.5% of the hammer price, minimum $225, maximum $4,500, as published; verify on the link.', verifyUrl: 'https://thembmarket.com/how-it-works' },
  { houseId: 'hemmings', basis: 'stated-per-lot', note: 'A percent with a minimum and a cap; check the current figures on the site and type the percent.', verifyUrl: 'https://www.hemmings.com/auction' },
  { houseId: 'rmsothebys', basis: 'percent', percent: 12, note: '12% of the hammer price up to $250,000 and 10% above, as published for the sale; Gavel uses 12%, which is high above $250,000. Verify on the link.', verifyUrl: 'https://rmsothebys.com/auctions/mo26/bidder-info/' },
  { houseId: 'gooding', basis: 'percent', percent: 12, note: 'Live sales 12% of the hammer price, 10% above $250,000; online-only sales 10%, as published. Gavel uses 12%; type 10 for an online sale. Verify on the link.', verifyUrl: 'https://www.goodingco.com/terms/' },
  { houseId: 'bonhams', basis: 'stated-per-lot', note: 'The buyer\'s premium changed on 1 October 2026. Check the page and type the percent.', verifyUrl: 'https://www.bonhams.com/how-to-buy/buyers-premium-united-states/' },
  { houseId: 'publicsurplus', basis: 'stated-per-lot', note: 'Set by each selling agency, often around 6.5% to 10%; read the lot and type the percent.', verifyUrl: 'https://www.publicsurplus.com/sms/help/public/useragree.html' },
  { houseId: 'municibid', basis: 'percent', percent: 9, note: '9% of the hammer price up to $99,999.99, then tiered, as published; verify on the link.', verifyUrl: 'https://support.municibid.com/en/articles/404877' },
  { houseId: 'propertyroom', basis: 'stated-per-lot', note: '10%, 12% or 15% on vehicles depending on the sale; read the lot and type the percent.', verifyUrl: 'https://www.propertyroom.com' },
  { houseId: 'govplanet', basis: 'sliding', note: 'A sliding fee by price; check the buyer-fees page and type the percent.', verifyUrl: 'https://www.govplanet.com/buyer-fees' },
  { houseId: 'hibid', basis: 'stated-per-lot', note: 'Set by each auctioneer, often 10% to 18%; read the sale terms and type the percent.', verifyUrl: 'https://hibid.com' },
  { houseId: 'purplewave', basis: 'percent', percent: 10, minUsd: 100, note: '10% on most sales (some 15%), minimum $100, as published; verify on the link.', verifyUrl: 'https://www.purplewave.com/auction/legal/terms' },
  { houseId: 'treasury', basis: 'none', note: 'No buyer premium on Treasury and Customs sales, as published; verify on the link.', verifyUrl: 'https://www.cwsmarketing.com/faqs' },
  { houseId: 'americasaa', basis: 'sliding', note: 'A sliding scale set by each location; ask before the sale and type the percent.', verifyUrl: 'https://www.americasaa.com' }
]

export function feeScheduleFor(houseId: string): FeeSchedule | undefined {
  return FEE_SCHEDULES.find((s) => s.houseId === houseId)
}

function pctLabel(pct: number): string {
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/\.?0+$/, '')}%`
}

function usdLabel(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

/**
 * The buyer fee for a house at a hammer price.
 * `overridePct` is a percent (5 means 5%) typed in by the member; it always wins.
 * Without an override, a sliding-scale or stated-per-lot house returns $0 and a
 * basis beginning "unknown" so the plan can warn instead of inventing a number.
 */
export function buyerFee(houseId: string, hammerUsd: number, overridePct?: number): { usd: number; basis: string; verifyUrl?: string } {
  const hammer = Number.isFinite(hammerUsd) && hammerUsd > 0 ? hammerUsd : 0
  const schedule = feeScheduleFor(houseId)

  if (overridePct !== undefined && Number.isFinite(overridePct) && overridePct >= 0) {
    return {
      usd: Math.round((hammer * overridePct) / 100),
      basis: `${pctLabel(overridePct)} of the hammer price (the fee you typed in)`,
      verifyUrl: schedule?.verifyUrl,
    }
  }

  if (houseId === 'sample') {
    return { usd: 0, basis: 'unknown — SAMPLE listing with no real auction house; pick a house or type a fee percent to see a fee' }
  }
  if (!schedule) {
    return { usd: 0, basis: "unknown — no published fee schedule for this source; enter the fee from the house's calculator" }
  }

  switch (schedule.basis) {
    case 'none':
      return { usd: 0, basis: 'none — this house charges no buyer fee on vehicles (as published, verify)', verifyUrl: schedule.verifyUrl }
    case 'percent': {
      const pct = schedule.percent ?? 0
      let usd = (hammer * pct) / 100
      if (schedule.minUsd !== undefined) usd = Math.max(schedule.minUsd, usd)
      if (schedule.maxUsd !== undefined) usd = Math.min(schedule.maxUsd, usd)
      const bounds = [
        schedule.minUsd !== undefined ? `min ${usdLabel(schedule.minUsd)}` : '',
        schedule.maxUsd !== undefined ? `max ${usdLabel(schedule.maxUsd)}` : '',
      ].filter(Boolean)
      const boundsText = bounds.length ? `, ${bounds.join(', ')}` : ''
      return { usd: Math.round(usd), basis: `${pctLabel(pct)} of the hammer price${boundsText} (as published, verify)`, verifyUrl: schedule.verifyUrl }
    }
    case 'sliding':
      return { usd: 0, basis: "unknown — sliding scale; enter the fee from the house's calculator", verifyUrl: schedule.verifyUrl }
    case 'stated-per-lot':
      return { usd: 0, basis: 'unknown — stated per lot; enter the buyer premium shown on the lot page', verifyUrl: schedule.verifyUrl }
  }
}
